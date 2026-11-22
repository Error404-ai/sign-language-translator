"""
Export reference poses for the browser hand player -> frontend/assets/poses.json

  letters: one clear frame per letter (middle of the first capture)
  signs:   the clip with the most hand-visible frames (gaps filled with the last seen frame).
           Dataset clips are preferred; your own recordings are used for signs the dataset lacks.

Existing entries in poses.json are kept for labels that have no data on this machine,
so exporting on a laptop with only part of the data never deletes animations.
"""
import json

import numpy as np

from signbridge.config import KINDS, ML_DIR
from signbridge.keypoints import hand_present

OUT = ML_DIR.parent / "frontend" / "assets" / "poses.json"


def letter_frames():
    out = {}
    root = KINDS["letters"]["data"]
    for d in sorted(root.iterdir()) if root.exists() else []:
        files = sorted(d.glob("*.npy"))
        if not files:
            continue
        seq = np.load(files[0])
        ok = np.where(hand_present(seq))[0]
        if len(ok):
            out[d.name] = np.round(seq[ok[len(ok) // 2]], 3).tolist()
    return out


def sign_clips():
    out = {}
    root = KINDS["words"]["data"]
    for d in sorted(root.iterdir()) if root.exists() else []:
        if not d.is_dir() or d.name == "idle":
            continue
        files = sorted(d.glob("*.npy"))
        dataset = [f for f in files if not f.name.startswith("my_")]
        clips = [np.load(f) for f in (dataset or files)]
        if not clips:
            continue
        best = max(clips, key=lambda s: int(hand_present(s).sum()))
        ok = hand_present(best)
        if not ok.any():
            continue
        last, frames = best[int(np.argmax(ok))], []
        for fr, p in zip(best, ok):
            if p:
                last = fr
            frames.append(np.round(last, 3).tolist())
        out[d.name] = frames
    return out


if __name__ == "__main__":
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    new = {"letters": letter_frames(), "signs": sign_clips()}
    poses = {k: {**old.get(k, {}), **new[k]} for k in new}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(poses))
    for k in poses:
        kept = sorted(set(poses[k]) - set(new[k]))
        print(f"{k}: {len(poses[k])} ({len(new[k])} from data" + (f", kept {len(kept)} existing)" if kept else ")"))
    print("signs:", sorted(poses["signs"]))
    print("wrote", OUT)
