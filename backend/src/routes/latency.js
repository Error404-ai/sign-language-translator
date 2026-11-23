import { Router } from "express";

/** Browser posts one sample per prediction; GET returns p50 / p95 per stage (for the report). */
export function latencyRoutes(log) {
  const r = Router();
  r.post("/latency", (req, res) => {
    const samples = Array.isArray(req.body) ? req.body : [req.body];
    const n = samples.slice(0, 100).filter(s => s && typeof s === "object" && log.add(s)).length;
    res.status(n ? 201 : 400).json(n ? { ok: true, added: n } : { error: "need {totalMs, ...} in ms" });
  });
  r.get("/latency", (req, res) => res.json(log.summary({ transport: req.query.transport, mode: req.query.mode })));
  r.delete("/latency", (_req, res) => { log.clear(); res.json({ ok: true }); });
  return r;
}
