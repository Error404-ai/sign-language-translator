"""MediaPipe result -> 130 normalised floats. Mirrored exactly in frontend/js/recognizer.js."""
import numpy as np

from .config import FEATURES, HAND_DIM


def norm_hand(pts):
    """pts: (21, 3). Wrist-relative, scaled by wrist->middle-MCP length, + raw wrist x, y."""
    wrist = pts[0].copy()
    rel = pts - wrist
    scale = np.linalg.norm(rel[9]) or 1.0
    return np.concatenate([(rel / scale).flatten(), wrist[:2]])


def extract_keypoints(results):
    """Slot 0 = Left hand, slot 1 = Right hand; missing hands stay zero."""
    out = np.zeros(FEATURES, dtype=np.float32)
    if results.multi_hand_landmarks and results.multi_handedness:
        for hand, info in zip(results.multi_hand_landmarks, results.multi_handedness):
            slot = 0 if info.classification[0].label == "Left" else 1
            pts = np.array([[p.x, p.y, p.z] for p in hand.landmark])
            out[slot * HAND_DIM:(slot + 1) * HAND_DIM] = norm_hand(pts)
    return out


def hand_present(x):
    """Boolean per frame (or per sample) - any non-zero feature."""
    return (np.asarray(x) != 0).any(axis=-1)
