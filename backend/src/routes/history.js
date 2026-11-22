import { Router } from "express";

export function historyRoutes(history) {
  const r = Router();
  r.get("/history", async (req, res, next) => {
    const limit = Math.trunc(Number(req.query.limit)) || 20;
    try { res.json(await history.list(Math.max(1, Math.min(limit, 100)))); } catch (e) { next(e); }
  });
  // lets the browser log results it decided itself (letters / rule-based trends)
  r.post("/history", async (req, res, next) => {
    try {
      const { mode, label, confidence = 1 } = req.body ?? {};
      if (typeof label !== "string" || !label || typeof mode !== "string") return res.status(400).json({ error: "mode and label are required" });
      await history.add({ mode, label: label.slice(0, 60), confidence: Number(confidence) || 0 });
      res.status(201).json({ ok: true });
    } catch (e) { next(e); }
  });
  r.delete("/history", async (_req, res, next) => {
    try { await history.clear(); res.json({ ok: true }); } catch (e) { next(e); }
  });
  return r;
}
