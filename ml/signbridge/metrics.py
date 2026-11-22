"""Accuracy / precision / recall / F1 report saved next to the model (feeds the paper)."""
import json
from datetime import datetime, timezone

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix


def report(y_true, y_pred, labels, out_path, extra=None):
    idx = list(range(len(labels)))
    txt = classification_report(y_true, y_pred, labels=idx, target_names=labels, zero_division=0)
    print(txt)
    print(confusion_matrix(y_true, y_pred, labels=idx))
    rep = classification_report(y_true, y_pred, labels=idx, target_names=labels, zero_division=0, output_dict=True)
    data = {
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "accuracy": float(np.mean(np.asarray(y_true) == np.asarray(y_pred))),
        "macro_avg": rep["macro avg"],
        "per_class": {k: rep[k] for k in labels},
        "test_samples": int(len(y_true)),
        **(extra or {}),
    }
    out_path.write_text(json.dumps(data, indent=2))
    print("metrics ->", out_path)
    return data
