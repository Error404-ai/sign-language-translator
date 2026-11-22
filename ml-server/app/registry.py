"""Loads every trained model from ml/models/. Missing optional models are simply skipped."""
import json
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import tensorflow as tf

MODELS_DIR = Path(os.getenv("MODELS_DIR", Path(__file__).resolve().parents[2] / "ml" / "models"))

# name -> (model file, labels file, input shape, required)
SPECS = {
    "words":   ("sign_lstm.keras",   "labels.json",          (30, 130), True),
    "letters": ("alphabet.keras",    "alphabet_labels.json", (130,),    True),
    "trends":  ("trends_lstm.keras", "trends_labels.json",   (30, 130), False),
}


@dataclass
class Classifier:
    model: tf.keras.Model
    labels: list[str]
    shape: tuple

    def predict(self, x):
        x = np.asarray(x, dtype=np.float32)
        if x.shape != self.shape or not np.isfinite(x).all():
            raise ValueError(f"expected finite values, shape {self.shape}, got {x.shape}")
        p = self.model(x[None], training=False).numpy()[0]     # faster than model.predict for 1 sample
        top3 = [{"label": self.labels[int(i)], "confidence": float(p[i])} for i in p.argsort()[::-1][:3]]
        return {**top3[0], "top3": top3}


def load_all():
    out = {}
    for name, (model_file, labels_file, shape, required) in SPECS.items():
        path = MODELS_DIR / model_file
        if not path.exists():
            if required:
                raise FileNotFoundError(path)
            continue
        clf = Classifier(tf.keras.models.load_model(path), json.loads((MODELS_DIR / labels_file).read_text()), shape)
        clf.model(np.zeros((1, *shape), dtype=np.float32), training=False)   # warm-up, first call is slow
        out[name] = clf
    return out
