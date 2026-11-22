// End-to-end API test against a fake ml-server (no TensorFlow needed).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

let fakeMl, server, base, wsUrl;
const fakeReply = label => ({ label, confidence: 0.93, top3: [{ label, confidence: 0.93 }] });

before(async () => {
  fakeMl = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") return res.end(JSON.stringify({ signs: ["hello", "thank_you", "idle"], letters: ["A"], trends: [], trendsModel: false }));
    if (req.url === "/predict") return res.end(JSON.stringify(fakeReply("hello")));
    if (req.url === "/predict-letter") return res.end(JSON.stringify(fakeReply("A")));
    if (req.url === "/transcribe") {                       // echo what arrived so the test can check the proxy
      let body = ""; req.setEncoding("latin1");
      req.on("data", c => body += c);
      return req.on("end", () => res.end(JSON.stringify({
        text: "thank you", multipart: /multipart\/form-data/.test(req.headers["content-type"]),
        hasAudio: body.includes("RIFFfake"), hindi: /name="language"\r\n\r\nhi/.test(body),
        translate: /name="task"\r\n\r\ntranslate/.test(body),
      })));
    }
    res.statusCode = 404; res.end(JSON.stringify({ detail: "no 'trends' model trained yet" }));
  }).listen(0);
  process.env.ML_URL = `http://127.0.0.1:${fakeMl.address().port}`;
  const { createApp } = await import("../src/app.js");
  const { createJsonStore } = await import("../src/services/historyStore.js");
  const store = createJsonStore(path.join(os.tmpdir(), `sb-history-${process.pid}.json`));
  const { attachWs } = await import("../src/ws.js");
  server = createApp({ history: store }).listen(0);
  attachWs(server, { history: store });
  base = `http://127.0.0.1:${server.address().port}/api`;
  wsUrl = `ws://127.0.0.1:${server.address().port}/ws`;
});
after(() => { server.close(); fakeMl.close(); });

const post = (route, body) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const seq = Array.from({ length: 30 }, () => new Array(130).fill(0));

test("health reports ml ok", async () => {
  const h = await (await fetch(base + "/health")).json();
  assert.equal(h.ml, "ok");
  assert.equal(h.trendsModel, false);
});

test("word prediction is accepted and logged", async () => {
  const d = await (await post("/predict", { sequence: seq })).json();
  assert.equal(d.accepted, true);
  const hist = await (await fetch(base + "/history")).json();
  assert.equal(hist[0].label, "hello");
  assert.equal(hist[0].mode, "words");
});

test("letter prediction proxies through backend", async () => {
  const d = await (await post("/predict-letter", { keypoints: new Array(130).fill(0) })).json();
  assert.equal(d.label, "A");
});

test("bad shapes are rejected with 400", async () => {
  assert.equal((await post("/predict", { sequence: [[1, 2]] })).status, 400);
  assert.equal((await post("/predict-letter", { keypoints: [1] })).status, 400);
});

test("missing trends model gives 404", async () => {
  assert.equal((await post("/predict-trend", { sequence: seq })).status, 404);
});

test("text-to-sign uses ml vocab", async () => {
  const d = await (await post("/text-to-sign", { text: "hello there" })).json();
  assert.equal(d.tokens[0].type, "sign");
  assert.equal(d.tokens[1].type, "fingerspell");
});

test("transcribe forwards audio + options as multipart", async () => {
  const r = await fetch(base + "/transcribe?language=hi&task=translate",
    { method: "POST", headers: { "Content-Type": "audio/wav" }, body: Buffer.from("RIFFfake-audio") });
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(d, { text: "thank you", multipart: true, hasAudio: true, hindi: true, translate: true });
});

test("transcribe without audio is a 400", async () => {
  const r = await fetch(base + "/transcribe", { method: "POST", headers: { "Content-Type": "audio/webm" } });
  assert.equal(r.status, 400);
});

// ---------- WebSocket channel ----------
function wsClient() {
  const ws = new WebSocket(wsUrl), waiting = new Map();
  ws.on("message", raw => { const m = JSON.parse(raw); waiting.get(m.id ?? m.type)?.(m); });
  const ask = msg => new Promise(res => { waiting.set(msg.id ?? "pong", res); ws.send(JSON.stringify(msg)); });
  return new Promise(res => ws.on("open", () => res({ ask, close: () => ws.close() })));
}

test("websocket: predictions for every kind, errors, ping", async () => {
  const c = await wsClient();
  try {
    const w = await c.ask({ id: 1, type: "predict", kind: "words", sequence: seq });
    assert.equal(w.ok, true); assert.equal(w.label, "hello"); assert.equal(w.accepted, true);
    assert.ok(Number.isFinite(w.mlMs) && Number.isFinite(w.latencyMs));
    const l = await c.ask({ id: 2, type: "predict", kind: "letters", keypoints: new Array(130).fill(0), minConfidence: 0.99 });
    assert.equal(l.label, "A"); assert.equal(l.accepted, false);                     // below minConfidence
    const bad = await c.ask({ id: 3, type: "predict", kind: "words", sequence: [[1]] });
    assert.deepEqual([bad.ok, bad.status], [false, 400]);
    const none = await c.ask({ id: 4, type: "predict", kind: "trends", sequence: seq });
    assert.deepEqual([none.ok, none.status], [false, 404]);
    const kind = await c.ask({ id: 5, type: "predict", kind: "nope" });
    assert.equal(kind.status, 400);
    const pong = await c.ask({ type: "ping", t: 123 });
    assert.deepEqual(pong, { type: "pong", t: 123 });
  } finally { c.close(); }
});

// ---------- latency report ----------
test("latency samples are summarised as p50 / p95", async () => {
  await fetch(base + "/latency", { method: "DELETE" });
  const samples = Array.from({ length: 20 }, (_, i) => ({ totalMs: 100 + i * 10, mlMs: 20, transport: i % 2 ? "ws" : "http" }));
  assert.equal((await fetch(base + "/latency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(samples) })).status, 201);
  assert.equal((await post("/latency", { nothing: 1 })).status, 400);
  const s = await (await fetch(base + "/latency")).json();
  assert.equal(s.n, 20);
  assert.equal(s.totalMs.p50, 195);                 // median of 100..290
  assert.equal(s.totalMs.p95, 280.5);
  assert.equal(s.mlMs.p95, 20);
  assert.equal(s.byTransport.ws.n, 10);
  assert.equal((await (await fetch(base + "/latency?transport=http")).json()).n, 10);
});

test("web app is served from the same origin; unknown API routes stay JSON 404", async () => {
  const root = base.replace(/\/api$/, "");
  const page = await fetch(root + "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html/i);
  assert.equal((await fetch(root + "/js/config.js")).status, 200);
  const miss = await fetch(base + "/nope");
  assert.equal(miss.status, 404);
  assert.equal((await miss.json()).error, "not found");
});

// ---------- robustness (code-review fixes) ----------
test("websocket survives null messages and oversized frames", async () => {
  const c = await wsClient();
  try {
    const raw = new WebSocket(wsUrl);
    await new Promise(r => raw.on("open", r));
    const reply = new Promise(r => raw.once("message", m => r(JSON.parse(m))));
    raw.send("null");
    assert.equal((await reply).status, 400);
    const closed = new Promise(r => raw.on("close", r));
    raw.on("error", () => {});
    raw.send("x".repeat(2 * 1024 * 1024 + 10));               // > maxPayload: server closes this socket only
    await closed;
    const w = await c.ask({ id: 9, type: "predict", kind: "words", sequence: seq });
    assert.equal(w.ok, true);                                  // backend still alive for everyone else
  } finally { c.close(); }
});

test("minConfidence must be a number in 0..1; history limit is clamped", async () => {
  assert.equal((await post("/predict", { sequence: seq, minConfidence: null })).status, 400);
  assert.equal((await post("/predict", { sequence: seq, minConfidence: "abc" })).status, 400);
  assert.equal((await post("/predict", { sequence: seq, minConfidence: 0.5 })).status, 200);
  for (let i = 0; i < 3; i++) await post("/history", { mode: "letters", label: "A" });
  assert.equal((await (await fetch(base + "/history?limit=-1")).json()).length, 1);
});
