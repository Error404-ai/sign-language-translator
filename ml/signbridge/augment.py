"""Data augmentation for keypoint samples. Zero rows (no hand) always stay zero."""
import numpy as np

from .config import HAND_DIM
from .keypoints import hand_present


def augment_sequence(x, rng):
    """x: (T, 130). Trim/stretch in time, rescale hand, jitter, shift framing."""
    T = x.shape[0]
    s = rng.integers(0, 5)
    e = T - 1 - rng.integers(0, 5)
    x = x[np.round(np.linspace(s, e, T)).astype(int)].copy()
    for slot in (0, 1):
        b = slot * HAND_DIM
        on = hand_present(x[:, b:b + HAND_DIM])
        if not on.any():
            continue
        x[on, b:b + 63] = x[on, b:b + 63] * rng.uniform(0.93, 1.07) + rng.normal(0, 0.012, (on.sum(), 63))
        x[on, b + 63:b + 65] += rng.normal(0, 0.05, 2)          # different camera framing
    return x


def augment_frames(X, rng):
    """X: (N, 130) single frames. Per-frame hand size, jitter and position."""
    A = X.copy()
    for slot in (0, 1):
        b = slot * HAND_DIM
        on = hand_present(A[:, b:b + HAND_DIM])
        n = int(on.sum())
        if n == 0:
            continue
        A[on, b:b + 63] *= rng.uniform(0.9, 1.1, (n, 1))
        A[on, b:b + 63] += rng.normal(0, 0.01, (n, 63))
        A[on, b + 63:b + 65] += rng.normal(0, 0.12, (n, 2))
    return A
