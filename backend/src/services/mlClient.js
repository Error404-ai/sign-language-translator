import { config } from "../config.js";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function send(route, opts, timeoutMs) {
  let r;
  try { r = await fetch(config.mlUrl + route, { ...opts, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e) {
    if (e.name === "TimeoutError") throw new HttpError(504, `ml-server timed out after ${timeoutMs} ms`);
    throw new HttpError(502, `ml-server unreachable — is uvicorn running on ${config.mlUrl}?`);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 4xx from the ML server are the caller's problem (bad audio, no model trained) -> pass through
    const status = r.status >= 400 && r.status < 500 || r.status === 503 ? r.status : 502;
    throw new HttpError(status, data.detail || `ml-server returned ${r.status}`);
  }
  return data;
}

/** JSON call to the FastAPI ml-server. */
export function ml(route, body) {
  const opts = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  return send(route, opts, config.mlTimeoutMs);
}

/** Multipart upload of an audio clip to Whisper. */
export function mlTranscribe(audio, mime, { language = "auto", task = "transcribe" } = {}) {
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: mime || "application/octet-stream" }), "speech");
  form.append("language", language);
  form.append("task", task);
  return send("/transcribe", { method: "POST", body: form }, config.transcribeTimeoutMs);
}

// /health is cached so text-to-sign doesn't hit the ML server on every request.
// strict: the caller is checking liveness, so a failed refresh throws instead of returning the stale copy.
// Concurrent callers share one in-flight refresh.
let cache = { at: 0, health: null }, inflight = null;
export async function mlHealth({ maxAgeMs = config.vocabTtlMs, strict = false } = {}) {
  if (!cache.health || Date.now() - cache.at > maxAgeMs) {
    inflight ??= ml("/health").then(h => { cache = { at: Date.now(), health: h }; return h; })
                              .finally(() => { inflight = null; });
    try { await inflight; }
    catch (e) { if (strict || !cache.health) throw e; }
  }
  return cache.health;
}

/** Sign vocabulary; [] when the ML server is unreachable, so text-to-sign still fingerspells everything. */
export async function vocab() {
  try { return (await mlHealth()).signs.filter(s => s !== "idle"); }
  catch { return []; }
}
