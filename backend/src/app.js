import fs from "node:fs";
import express from "express";
import cors from "cors";
import { mlHealth } from "./services/mlClient.js";
import { createJsonStore } from "./services/historyStore.js";
import { predictRoutes } from "./routes/predict.js";
import { historyRoutes } from "./routes/history.js";
import { translateRoutes } from "./routes/translate.js";
import { transcribeRoutes } from "./routes/transcribe.js";
import { latencyRoutes } from "./routes/latency.js";
import { createLatencyLog } from "./services/latency.js";
import { config } from "./config.js";

export function createApp({ history = createJsonStore(), latency = createLatencyLog(), frontendDir = config.frontendDir } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  const api = express.Router();
  api.get("/health", async (_req, res) => {
    try {
      const h = await mlHealth({ maxAgeMs: 4000, strict: true });   // many tabs polling every 5 s share one ML call
      res.json({ backend: "ok", ml: "ok", signs: h.signs.length, letters: h.letters.length,
                 trendsModel: !!h.trendsModel, whisper: !!h.whisper?.available, history: history.kind });
    } catch { res.json({ backend: "ok", ml: "down", whisper: false, history: history.kind }); }
  });
  api.use(predictRoutes(history), historyRoutes(history), translateRoutes(), transcribeRoutes(), latencyRoutes(latency));
  app.use("/api", api);

  // Serve the web app from the same origin (deployment: one URL, HTTPS for camera + mic, no CORS).
  if (frontendDir && fs.existsSync(frontendDir)) app.use(express.static(frontendDir));

  app.use((_req, res) => res.status(404).json({ error: "not found" }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  return app;
}
