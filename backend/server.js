import express from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textToSign } from "./gloss.js";

const PORT = process.env.PORT || 5000;
const ML_URL = process.env.ML_URL || "http://localhost:8000";
const HISTORY_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "history.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---- tiny JSON-file store (swap for MongoDB/Mongoose later) ----
let history = [];
try { history = JSON.parse(await fs.readFile(HISTORY_FILE, "utf8")); } catch { /* first run */ }
let saving = Promise.resolve();
const persist = () => {
  saving = saving.then(async () => {
    await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history));
  }).catch(console.error);
};

// ---- ml-server client ----
async function ml(route, opts = {}) {
  let r;
  try { r = await fetch(ML_URL + route, { signal: AbortSignal.timeout(8000), ...opts }); }
  catch { throw Object.assign(new Error("ml-server unreachable — is uvicorn running on " + ML_URL + "?"), { status: 502 }); }
  if (!r.ok) throw Object.assign(new Error(`ml-server returned ${r.status}`), { status: 502 });
  return r.json();
}
let vocabCache = { at: 0, signs: [] };
async function vocab() {
  if (Date.now() - vocabCache.at > 60_000) {
    try { vocabCache = { at: Date.now(), signs: (await ml("/health")).signs.filter(s => s !== "idle") }; } catch { /* keep old */ }
  }
  return vocabCache.signs;
}

const validSeq = s => Array.isArray(s) && s.length === 30 &&
  s.every(f => Array.isArray(f) && f.length === 130 && f.every(Number.isFinite));

// ---- routes ----
app.get("/api/health", async (_req, res) => {
  try { res.json({ backend: "ok", ml: "ok", signs: (await ml("/health")).signs.length }); }
  catch { res.json({ backend: "ok", ml: "down" }); }
});

app.get("/api/signs", async (_req, res, next) => { try { res.json(await vocab()); } catch (e) { next(e); } });

app.post("/api/predict", async (req, res, next) => {
  try {
    const { sequence, minConfidence = 0.7 } = req.body ?? {};
    if (!validSeq(sequence)) return res.status(400).json({ error: "sequence must be 30 frames x 130 numbers" });
    const t0 = performance.now();
    const p = await ml("/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequence }) });
    const accepted = p.confidence >= Number(minConfidence) && p.label !== "idle";
    if (accepted) {
      history.unshift({ label: p.label, confidence: p.confidence, at: new Date().toISOString() });
      history.length = Math.min(history.length, 500);
      persist();
    }
    res.json({ ...p, accepted, latencyMs: Math.round(performance.now() - t0) });
  } catch (e) { next(e); }
});

app.get("/api/history", (req, res) => res.json(history.slice(0, Math.min(Number(req.query.limit) || 20, 100))));
app.delete("/api/history", (_req, res) => { history = []; persist(); res.json({ ok: true }); });

app.post("/api/text-to-sign", async (req, res, next) => {
  try {
    const { text, gloss = true } = req.body ?? {};
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text is required" });
    res.json({ tokens: textToSign(text, await vocab(), { gloss }) });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
app.listen(PORT, () => console.log(`SignBridge backend on :${PORT} -> ml-server ${ML_URL}`));
