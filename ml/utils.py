import numpy as np

def extract_keypoints(results):
    """Return a 126-float vector: left hand (63) + right hand (63).
    Each hand = 21 landmarks x (x, y, z). Missing hand = zeros."""
    out = np.zeros(126, dtype=np.float32)
    if results.multi_hand_landmarks and results.multi_handedness:
        for hand, info in zip(results.multi_hand_landmarks, results.multi_handedness):
            label = info.classification[0].label  # "Left" or "Right"
            slot = 0 if label == "Left" else 1
            coords = np.array([[p.x, p.y, p.z] for p in hand.landmark]).flatten()
            out[slot * 63:(slot + 1) * 63] = coords
    return out