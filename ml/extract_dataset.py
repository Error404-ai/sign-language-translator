import sys, re
from pathlib import Path
import numpy as np
from video_to_npy import video_to_sequence

SRC = Path(sys.argv[1])          # e.g. C:\datasets\include
OUT = Path("data/landmarks")     # already in .gitignore via ml/data/

videos = sorted(list(SRC.rglob("*.MOV")) + list(SRC.rglob("*.mp4")))
print(f"found {len(videos)} videos")

for i, v in enumerate(videos, 1):
    label = re.sub(r"^\d+\.\s*", "", v.parent.name).strip().lower().replace(" ", "_")
    d = OUT / label
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"{v.stem}.npy"
    if f.exists():               # resume if interrupted
        continue
    seq = video_to_sequence(str(v))
    np.save(f, seq)
    print(f"[{i}/{len(videos)}] {label}/{v.stem} nonzero={int((seq != 0).sum())}")