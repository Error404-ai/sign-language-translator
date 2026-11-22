"""
Extract keypoints from every video of a dataset such as INCLUDE (resumable).

  python extract_dataset.py /path/to/include          # writes data/landmarks/<label>/<clip>.npy
"""
import sys
from pathlib import Path

import numpy as np

from signbridge.config import KINDS
from signbridge.dataset import label_of_folder
from video_to_npy import video_to_sequence

OUT = KINDS["words"]["data"]


def main(src):
    videos = sorted(p for p in Path(src).rglob("*") if p.suffix.lower() in {".mov", ".mp4"})
    print(f"found {len(videos)} videos")
    for i, v in enumerate(videos, 1):
        d = OUT / label_of_folder(v.parent.name)
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{v.stem}.npy"
        if f.exists():
            continue
        seq = video_to_sequence(v)
        np.save(f, seq)
        print(f"[{i}/{len(videos)}] {d.name}/{v.stem} nonzero={int((seq != 0).sum())}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
