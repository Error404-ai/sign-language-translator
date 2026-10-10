import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MODEL_DIR = Path(__file__).resolve().parent.parent / "ml" / "models"
model = tf.keras.models.load_model(MODEL_DIR / "sign_lstm.keras")
labels = json.load(open(MODEL_DIR / "labels.json"))

app = FastAPI(title="SignBridge ML server")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


class PredictRequest(BaseModel):
    sequence: list[list[float]]   # 30 frames x 130 values


@app.get("/health")
def health():
    return {"status": "ok", "signs": labels}


@app.post("/predict")
def predict(req: PredictRequest):
    seq = np.array(req.sequence, dtype=np.float32)
    if seq.shape != (30, 130):
        raise HTTPException(400, f"expected shape (30, 130), got {seq.shape}")
    p = model.predict(seq[None], verbose=0)[0]
    k = int(p.argmax())
    return {"label": labels[k], "confidence": float(p[k])}