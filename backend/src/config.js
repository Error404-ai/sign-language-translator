import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  port: Number(process.env.PORT) || 5050,
  // 127.0.0.1, not "localhost": Node may resolve localhost to IPv6 ::1 while uvicorn listens on IPv4
  mlUrl: process.env.ML_URL || "http://127.0.0.1:8000",
  mlTimeoutMs: Number(process.env.ML_TIMEOUT_MS) || 8000,
  transcribeTimeoutMs: Number(process.env.TRANSCRIBE_TIMEOUT_MS) || 60_000,
  maxAudioBytes: 25 * 1024 * 1024,
  // MongoDB for history when set (e.g. mongodb://127.0.0.1:27017/signbridge or an Atlas URL), JSON file otherwise
  mongoUrl: process.env.MONGO_URL || "",
  historyFile: process.env.HISTORY_FILE || path.join(ROOT, "data", "history.json"),
  historyMax: 500,
  // static web app served at "/" (set FRONTEND_DIR="" to disable)
  frontendDir: process.env.FRONTEND_DIR ?? path.join(ROOT, "..", "frontend"),
  vocabTtlMs: 60_000,
  seqLen: 30,
  features: 130,
};
