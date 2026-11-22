import { config } from "./config.js";
import { LiveSocket } from "./socket.js";

export const socket = new LiveSocket(config.ws);

/** Fetch against the backend; JSON in/out unless raw fetch options are given. Throws Error with .status on HTTP errors. */
async function request(path, body, raw) {
  const opts = raw ?? (body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const r = await fetch(config.api + path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
  return data;
}

const PREDICT_PATH = { words: "/predict", letters: "/predict-letter", trends: "/predict-trend" };

/**
 * Predictions go over the WebSocket when it is connected, otherwise plain HTTP.
 * The result carries `transport` ("ws" | "http") and `roundTripMs` for the latency probe.
 */
async function predict(kind, body) {
  const t0 = performance.now();
  let d, transport = "ws";
  try { d = await socket.request({ type: "predict", kind, ...body }); }
  catch (e) {
    if (!e.offline) throw e;                   // server answered with an error, or timed out mid-request: don't resend
    transport = "http"; d = await request(PREDICT_PATH[kind], body);
  }
  return { ...d, transport, roundTripMs: performance.now() - t0 };
}

export const api = {
  health: () => request("/health"),
  predictWord: (sequence, minConfidence) => predict("words", { sequence, minConfidence }),
  predictLetter: (keypoints, minConfidence) => predict("letters", { keypoints, minConfidence }),
  predictTrend: (sequence, minConfidence) => predict("trends", { sequence, minConfidence }),
  reportLatency: sample => request("/latency", sample),
  history: (limit = 6) => request(`/history?limit=${limit}`),
  log: (mode, label, confidence = 1) => request("/history", { mode, label, confidence }),
  textToSign: text => request("/text-to-sign", { text }),
  /** audio Blob from MediaRecorder -> { text, language, latencyMs, ... } */
  transcribe: (blob, language = "auto", task = "transcribe") =>
    request(`/transcribe?${new URLSearchParams({ language, task })}`, undefined,
            { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob }),
};
