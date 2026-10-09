import numpy as np

def _norm_hand(h):
    wrist = h[0].copy()
    h = h - wrist
    scale = np.linalg.norm(h[9]) or 1.0
    return np.concatenate([(h / scale).flatten(), wrist[:2]])

def extract_keypoints(results):
    out = np.zeros(130, dtype=np.float32)
    if results.multi_hand_landmarks and results.multi_handedness:
        for hand, info in zip(results.multi_hand_landmarks, results.multi_handedness):
            slot = 0 if info.classification[0].label == "Left" else 1
            pts = np.array([[p.x, p.y, p.z] for p in hand.landmark])
            out[slot * 65:(slot + 1) * 65] = _norm_hand(pts)
    return out