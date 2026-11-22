import { WebSocketServer } from "ws";
import { predict } from "./routes/predict.js";

/**
 * Real-time channel on the same port as the HTTP API:  ws://<host>:<port>/ws
 *
 *   -> { id, type: "predict", kind: "words" | "letters" | "trends", sequence | keypoints, minConfidence }
 *   <- { id, ok: true, label, confidence, top3, accepted, mlMs, latencyMs }
 *   <- { id, ok: false, status, error }
 *   -> { type: "ping", t }   <- { type: "pong", t }
 *
 * One socket per browser tab. Saves the per-request HTTP + CORS overhead and keeps the
 * connection warm; the browser falls back to HTTP whenever the socket is down.
 */
export function attachWs(server, { history, path = "/ws", maxPayload = 2 * 1024 * 1024 } = {}) {
  const wss = new WebSocketServer({ server, path, maxPayload });
  wss.on("connection", ws => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    // protocol errors (frame > maxPayload, invalid UTF-8): ws closes the socket; without a listener Node would crash
    ws.on("error", e => console.warn("ws client error:", e.message));
    ws.on("message", async raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return send(ws, { ok: false, status: 400, error: "invalid JSON" }); }
      if (!msg || typeof msg !== "object") return send(ws, { ok: false, status: 400, error: "expected a JSON object" });
      if (msg.type === "ping") return send(ws, { type: "pong", t: msg.t });
      if (msg.type !== "predict") return send(ws, { id: msg.id, ok: false, status: 400, error: "unknown type" });
      try { send(ws, { id: msg.id, ok: true, ...(await predict(msg.kind, msg, history)) }); }
      catch (e) { send(ws, { id: msg.id, ok: false, status: e.status || 500, error: e.message }); }
    });
  });
  // drop dead connections (laptop sleep, wifi change) so they don't pile up
  const beat = setInterval(() => wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  }), 30_000);
  beat.unref();
  wss.on("close", () => clearInterval(beat));
  return wss;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
