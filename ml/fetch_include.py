"""
Download selected words from the INCLUDE dataset (Zenodo record 4010759) straight into keypoints.

The full dataset is ~57 GB of HD video in 44 zip files. This reads only each zip's table of contents
(HTTP range requests), downloads just the videos of the words you ask for, turns each into a
(30, 130) keypoint .npy with the same code as extract_dataset.py, and deletes the video. Resumable.

  python fetch_include.py --list                    # every word in INCLUDE, with clip counts
  python fetch_include.py doctor hospital "thank you"
  python fetch_include.py --signs signs.txt         # every word of the list that INCLUDE has

Writes data/landmarks/<label>/<clip>.npy, then: python train.py --signs signs.txt
"""
import argparse
import io
import json
import os
import shutil
import ssl
import tempfile
import time
import urllib.request
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from functools import lru_cache
from pathlib import Path

from signbridge.config import DATA_DIR, KINDS
from signbridge.dataset import label_of_folder, norm_label, read_list
from signbridge.keypoints import hand_present

RECORD = "https://zenodo.org/api/records/4010759/files/{}/content"
PARTS = {"Adjectives": 8, "Animals": 2, "Clothes": 2, "Colours": 2, "Days_and_Time": 3, "Electronics": 2,
         "Greetings": 2, "Home": 4, "Jobs": 2, "Means_of_Transportation": 2, "People": 5, "Places": 4,
         "Pronouns": 2, "Seasons": 1, "Society": 3}
ZIPS = [f"{c}_{i}of{n}.zip" for c, n in PARTS.items() for i in range(1, n + 1)]
INDEX = DATA_DIR / "include_index.json"
OUT = KINDS["words"]["data"]

try:                                   # python.org builds on macOS ship without CA certificates
    import certifi
    _CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _CTX = ssl.create_default_context()
_OPENER = urllib.request.build_opener(urllib.request.HTTPSHandler(context=_CTX))
_UA = {"User-Agent": "signbridge-include-fetch"}


class RangeFile(io.RawIOBase):
    """Read-only, seekable view of a remote file; every read is one HTTP Range request."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        head = _OPENER.open(urllib.request.Request(url, method="HEAD", headers=_UA), timeout=60)
        self.size = int(head.headers["Content-Length"])

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size or not len(b):
            return 0
        end = min(self.pos + len(b), self.size) - 1
        req = urllib.request.Request(self.url, headers={**_UA, "Range": f"bytes={self.pos}-{end}"})
        data = _OPENER.open(req, timeout=120).read()
        b[:len(data)] = data
        self.pos += len(data)
        return len(data)


@lru_cache(maxsize=4)
def remote_zip(name):
    return zipfile.ZipFile(io.BufferedReader(RangeFile(RECORD.format(name)), 1 << 20))


def out_path(member):
    """zip member '.../48. Hello/MVI_0029.MOV' -> data/landmarks/hello/MVI_0029.npy"""
    return OUT / label_of_folder(member.split("/")[-2]) / f"{Path(member).stem}.npy"


def build_index():
    """{label: [[zip, member], ...]} for every video in INCLUDE; cached in data/include_index.json."""
    if INDEX.exists():
        return json.loads(INDEX.read_text())
    index = {}
    for n, z in enumerate(ZIPS, 1):
        print(f"indexing {z} ({n}/{len(ZIPS)})", flush=True)
        for info in remote_zip(z).infolist():
            parts = info.filename.split("/")
            if not info.is_dir() and len(parts) >= 2 and info.filename.lower().endswith((".mov", ".mp4")):
                folder = parts[-2]
                if folder.lower() != "extra":
                    index.setdefault(label_of_folder(folder), []).append([z, info.filename])
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(json.dumps(index))
    return index


def fetch_one(zname, member):
    import numpy as np
    from video_to_npy import video_to_sequence
    out = out_path(member)
    if out.exists():
        return out, None
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        video = Path(tmp) / Path(member).name
        for attempt in range(5):
            try:
                with remote_zip(zname).open(member) as src, open(video, "wb") as dst:
                    shutil.copyfileobj(src, dst, 8 << 20)
                break
            except Exception:
                remote_zip.cache_clear()
                if attempt == 4:
                    raise
                time.sleep(5 * (attempt + 1))
        seq = video_to_sequence(video)
    part = out.with_suffix(".part.npy")
    np.save(part, seq)
    os.replace(part, out)
    return out, int(hand_present(seq).sum())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("words", nargs="*", help="INCLUDE words, e.g. doctor 'thank you'")
    ap.add_argument("--signs", help="label list file (e.g. signs.txt); words INCLUDE lacks are skipped")
    ap.add_argument("--list", action="store_true", help="print every INCLUDE word and exit")
    ap.add_argument("--workers", type=int, default=5, help="parallel downloads (more is not faster on slow links)")
    args = ap.parse_args()

    index = build_index()
    if args.list:
        for label in sorted(index):
            print(f"{label:24s} {len(index[label]):3d} clips")
        return
    wanted = [norm_label(w) for w in args.words] + (read_list(args.signs) if args.signs else [])
    if not wanted:
        ap.error("give words, --signs FILE or --list")
    missing = sorted({w for w in wanted if w not in index and w != "idle"})
    if missing:
        print("not in INCLUDE (record these with collect.py):", ", ".join(missing))
    jobs = [tuple(j) for w in dict.fromkeys(wanted) if w in index for j in index[w]]
    todo = [j for j in jobs if not out_path(j[1]).exists()]
    print(f"{len(jobs)} videos, {len(jobs) - len(todo)} already done, {len(todo)} to fetch (~13 MB each)")

    failed, t0 = 0, time.time()
    with ProcessPoolExecutor(args.workers) as pool:
        futures = [pool.submit(fetch_one, *j) for j in todo]
        for n, f in enumerate(as_completed(futures), 1):
            try:
                out, hands = f.result()
                print(f"[{n}/{len(todo)} {time.time() - t0:.0f}s] {out.parent.name}/{out.name} hand frames {hands}/30", flush=True)
            except Exception as e:
                failed += 1
                print(f"[{n}/{len(todo)}] FAILED {e!r}", flush=True)
    print("done" + (f" - {failed} failed, run the same command again to retry them" if failed else ""))


if __name__ == "__main__":
    main()
