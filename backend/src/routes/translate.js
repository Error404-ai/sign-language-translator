import { Router } from "express";
import { vocab } from "../services/mlClient.js";
import { textToSign } from "../services/gloss.js";

export function translateRoutes() {
  const r = Router();
  r.get("/signs", async (_req, res, next) => { try { res.json(await vocab()); } catch (e) { next(e); } });
  r.post("/text-to-sign", async (req, res, next) => {
    try {
      const { text, gloss = true } = req.body ?? {};
      if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text is required" });
      res.json({ tokens: textToSign(text, await vocab(), { gloss }) });
    } catch (e) { next(e); }
  });
  return r;
}
