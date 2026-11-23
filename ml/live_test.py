"""
Desktop live test (no browser / servers needed).

  python live_test.py                  # word signs (sliding 2.5 s window)
  python live_test.py --kind trends    # trend gestures (needs models/trends_lstm.keras)
  python live_test.py --kind letters   # static A-Z letters
  python live_test.py --kind raw       # just check the camera + keypoints

Q quits.
"""
import argparse
import collections
import json

import numpy as np

from signbridge.camera import HandCam, CYAN
from signbridge.config import KINDS, MODELS_DIR, SEQ_LEN
from signbridge.keypoints import hand_present

ap = argparse.ArgumentParser()
ap.add_argument("--kind", choices=["words", "trends", "letters", "raw"], default="words")
ap.add_argument("--threshold", type=float, default=0.8)
args = ap.parse_args()

MOTION_MIN = 0.004
WINDOW = 75                      # ~2.5 s of frames, sampled down to SEQ_LEN


def load_model():
    import tensorflow as tf
    cfg = KINDS[args.kind]
    return tf.keras.models.load_model(MODELS_DIR / cfg["model"]), json.loads((MODELS_DIR / cfg["labels"]).read_text())


def sequence_step(model, labels, buf, n, state):
    """Classify the sliding window every 5 frames; returns display text."""
    if len(buf) < WINDOW or n % 5:
        return state["text"]
    seq = np.array(buf)[np.linspace(0, WINDOW - 1, SEQ_LEN).astype(int)]
    present = hand_present(seq)
    if present.mean() <= 0.5:                      # hands visible in most frames
        return "..."
    both = present[1:] & present[:-1]
    d = np.abs(np.diff(seq, axis=0)).mean(axis=1)
    state["motion"] = float(d[both].mean()) if both.any() else 0.0
    p = model(seq[None], training=False).numpy()[0]
    k = int(p.argmax())
    ok = p[k] > args.threshold and labels[k] != "idle" and state["motion"] > MOTION_MIN
    return f"{labels[k]} {p[k]:.0%}" if ok else "..."


def letter_step(model, labels, kp, recent):
    if not kp.any():
        recent.clear()
        return "..."
    p = model(kp[None], training=False).numpy()[0]
    k = int(p.argmax())
    recent.append(labels[k] if p[k] > args.threshold else None)
    top, count = collections.Counter(recent).most_common(1)[0]
    return f"{top}  {p[k]:.0%}" if top and count >= 5 else "..."


def main():
    model, labels = (None, None) if args.kind == "raw" else load_model()
    buf, recent = collections.deque(maxlen=WINDOW), collections.deque(maxlen=8)
    state, n = {"text": "...", "motion": 0.0}, 0
    with HandCam(f"SignBridge live - {args.kind}") as cam:
        while True:
            frame, kp, _ = cam.read()
            if frame is None:
                print("camera read failed")
                break
            n += 1
            if args.kind == "raw":
                cam.show(frame, f"keypoints: {kp.shape}, nonzero: {int((kp != 0).sum())}")
            elif args.kind == "letters":
                cam.show(frame, letter_step(model, labels, kp, recent), scale=1.3)
            else:
                buf.append(kp)
                state["text"] = sequence_step(model, labels, buf, n, state)
                cam.show(frame, state["text"], scale=1.1)
                cam.show(frame, f"motion {state['motion']:.4f}", CYAN, line=1)
            if cam.flush(frame) == "q":
                break


if __name__ == "__main__":
    main()
