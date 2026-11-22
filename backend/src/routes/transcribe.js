import express, { Router } from "express";
import { config } from "../config.js";
import { mlTranscribe } from "../services/mlClient.js";

/**
 * POST /api/transcribe?language=auto|en|hi&task=transcribe|translate
 * Body: the raw audio blob from MediaRecorder (Content-Type audio/webm, audio/mp4, audio/wav ...).
 * Forwarded to the ml-server's Whisper endpoint as multipart.
 */
export function transcribeRoutes() {
  const r = Router();
  const raw = express.raw({ type: ["audio/*", "video/webm", "application/octet-stream"], limit: config.maxAudioBytes });
  r.post("/transcribe", raw, async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0)
        return res.status(400).json({ error: "send the audio as the request body (Content-Type audio/*)" });
      const { language = "auto", task = "transcribe" } = req.query;
      res.json(await mlTranscribe(req.body, req.get("content-type"), { language: String(language), task: String(task) }));
    } catch (e) { next(e); }
  });
  return r;
}
