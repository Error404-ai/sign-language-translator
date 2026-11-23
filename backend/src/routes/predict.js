import { Router } from "express";
import { config } from "../config.js";
import { HttpError, ml } from "../services/mlClient.js";

const isFrame = f => Array.isArray(f) && f.length === config.features && f.every(Number.isFinite);
const isSeq = s => Array.isArray(s) && s.length === config.seqLen && s.every(isFrame);
const seqErr = `sequence must be ${config.seqLen} frames x ${config.features} numbers`;

// kind -> route (same path on the backend and the ml-server), request field, validator
const KINDS = {
  words:   { route: "/predict",        field: "sequence",  valid: isSeq,   err: seqErr },
  letters: { route: "/predict-letter", field: "keypoints", valid: isFrame, err: `keypoints must be ${config.features} numbers` },
  trends:  { route: "/predict-trend",  field: "sequence",  valid: isSeq,   err: seqErr },
};

/**
 * One prediction, shared by the HTTP routes and the WebSocket channel.
 * Returns the ml-server answer + accepted + latencyMs (time spent in the backend incl. the ML call).
 */
export async function predict(mode, body, history) {
  const k = KINDS[mode];
  if (!k) throw new HttpError(400, `kind must be one of ${Object.keys(KINDS).join(", ")}`);
  const { [k.field]: input, minConfidence = 0.7, record = mode === "words" } = body ?? {};
  if (!k.valid(input)) throw new HttpError(400, k.err);
  if (typeof minConfidence !== "number" || !(minConfidence >= 0 && minConfidence <= 1))
    throw new HttpError(400, "minConfidence must be a number between 0 and 1");
  const t0 = performance.now();
  const p = await ml(k.route, { [k.field]: input });
  const mlMs = performance.now() - t0;
  const accepted = p.confidence >= minConfidence && p.label !== "idle";
  if (accepted && record) await history.add({ mode, label: p.label, confidence: p.confidence });
  return { ...p, accepted, mlMs: Math.round(mlMs * 10) / 10, latencyMs: Math.round(performance.now() - t0) };
}

export function predictRoutes(history) {
  const r = Router();
  for (const [mode, k] of Object.entries(KINDS)) {
    r.post(k.route, async (req, res, next) => {
      try { res.json(await predict(mode, req.body, history)); } catch (e) { next(e); }
    });
  }
  return r;
}
