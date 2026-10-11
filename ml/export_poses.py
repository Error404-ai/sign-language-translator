import json
from pathlib import Path
import numpy as np

ROOT = Path("data")
OUT = Path("../frontend/poses.json")
out = {"letters": {}, "signs": {}}


def present(a):
    return (a != 0).any(axis=1)


# letters: one clear frame (middle of the first capture)
for d in sorted((ROOT / "alphabet").iterdir()):
    files = sorted(d.glob("*.npy"))
    if not files:
        continue
    seq = np.load(files[0])
    ok = np.where(present(seq))[0]
    if len(ok) == 0:
        continue
    out["letters"][d.name] = np.round(seq[ok[len(ok) // 2]], 3).tolist()

# word signs: the dataset clip (30 frames) with the most frames where hands were found
for d in sorted((ROOT / "landmarks").iterdir()):
    if not d.is_dir() or d.name == "idle":
        continue
    best, score = None, -1
    for f in d.glob("*.npy"):
        if f.name.startswith("my_"):
            continue
        s = np.load(f)
        sc = int(present(s).sum())
        if sc > score:
            best, score = s, sc
    if best is None or score <= 0:
        continue
    ok = present(best)
    last = best[int(np.argmax(ok))]
    frames = []
    for fr, p in zip(best, ok):
        if p:
            last = fr
        frames.append(np.round(last, 3).tolist())
    out["signs"][d.name] = frames

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(out))
print("letters:", len(out["letters"]), "signs:", sorted(out["signs"]))
print("wrote", OUT.resolve())