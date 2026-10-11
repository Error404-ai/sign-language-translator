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
model(np.zeros((1, 30, 130), dtype=np.float32), training=False)   # warm-up, first call is slow

alpha_model = tf.keras.models.load_model(MODEL_DIR / "alphabet.keras")
alpha_labels = json.load(open(MODEL_DIR / "alphabet_labels.json"))
alpha_model(np.zeros((1, 130), dtype=np.float32), training=False)  # warm-up

app = FastAPI(title="SignBridge ML server")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


class PredictRequest(BaseModel):
    sequence: list[list[float]]   # 30 frames x 130 values


class FrameRequest(BaseModel):
    keypoints: list[float]        # 130 values (one frame)


@app.get("/health")
def health():
    return {"status": "ok", "signs": labels, "letters": alpha_labels}


@app.post("/predict")
def predict(req: PredictRequest):
    seq = np.array(req.sequence, dtype=np.float32)
    if seq.shape != (30, 130) or not np.isfinite(seq).all():
        raise HTTPException(400, f"expected finite values, shape (30, 130), got {seq.shape}")
    p = model(seq[None], training=False).numpy()[0]       # faster than model.predict for 1 sample
    order = p.argsort()[::-1][:3]
    top3 = [{"label": labels[int(i)], "confidence": float(p[i])} for i in order]
    return {**top3[0], "top3": top3}


@app.post("/predict-letter")
def predict_letter(req: FrameRequest):
    x = np.array(req.keypoints, dtype=np.float32)
    if x.shape != (130,) or not np.isfinite(x).all():
        raise HTTPException(400, f"expected 130 finite values, got shape {x.shape}")
    p = alpha_model(x[None], training=False).numpy()[0]
    order = p.argsort()[::-1][:3]
    top3 = [{"label": alpha_labels[int(i)], "confidence": float(p[i])} for i in order]
    return {**top3[0], "top3": top3}