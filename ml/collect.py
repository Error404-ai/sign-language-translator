"""
Record your own training samples from the webcam.

  python collect.py hello thank_you idle                       # word signs (SPACE to record each clip)
  python collect.py --auto 20 hello thank_you idle             # hands-free: records 20 clips per sign
  python collect.py --signer tanishka --auto 15 --list signs.txt   # Phase B: whole vocabulary + idle, tagged
  python collect.py --kind trends --auto 20 clock_it six_seven idle
  python collect.py --kind letters                              # A..Z static hand shapes
  python collect.py --kind letters --start M                    # resume at M

Keys: SPACE = record, N = next label, Q = quit.
Samples are saved as data/<kind>/<label>/my_<signer>_###.npy (or my_###.npy without --signer).
Every team member should record with their own --signer name: train.py --split signer needs it.
Re-running resumes: labels that already have enough clips for that signer are skipped.
"""
import argparse
import string
import time

import numpy as np

from signbridge.camera import HandCam, ORANGE, RED
from signbridge.config import KINDS, SEQ_LEN
from signbridge.dataset import clean_signer, count_own, own_prefix, read_list

REC_FRAMES = 60          # ~2 s recorded per sequence clip, shrunk to SEQ_LEN
LETTER_FRAMES = 40       # frames per static-letter capture
LETTER_CAPTURES = 5


def parse():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("labels", nargs="*", help="labels to record (folder names)")
    ap.add_argument("--kind", choices=KINDS, default="words")
    ap.add_argument("--auto", type=int, metavar="N", help="hands-free mode, N samples per label")
    ap.add_argument("--start", default="A", help="letters only: first letter to record")
    ap.add_argument("--signer", default=None, help="your name, tags every clip (needed for --split signer)")
    ap.add_argument("--list", default=None, help="file with labels, one per line (e.g. signs.txt); idle is added")
    a = ap.parse_args()
    if a.signer:
        a.signer = clean_signer(a.signer)
    if a.list:
        a.labels = [*a.labels, *read_list(a.list)]
        if a.kind != "letters" and "idle" not in a.labels:
            a.labels.append("idle")
    if a.kind == "letters":
        letters = string.ascii_uppercase
        a.labels = [l.upper() for l in a.labels] or list(letters[letters.index(a.start.upper()):])
        a.per_label = a.auto or LETTER_CAPTURES
    else:
        a.labels = a.labels or ["idle"]
        a.per_label = a.auto or 20
    return a


def wait(cam, seconds, text):
    """Show a countdown for `seconds`; returns False if the user quit."""
    t0 = time.time()
    while time.time() - t0 < seconds:
        frame, _, _ = cam.read()
        if frame is None:
            return False
        cam.show(frame, text, ORANGE)
        if cam.flush(frame) == "q":
            return False
    return True


def record(cam, label, n_frames, keep_empty):
    seq = []
    while len(seq) < n_frames:
        frame, kp, _ = cam.read()
        if frame is None:
            return None
        if keep_empty or kp.any():
            seq.append(kp)
        cam.show(frame, f"RECORDING {label} {len(seq)}/{n_frames}", RED)
        if cam.flush(frame) == "q":
            return None
    return np.array(seq, dtype=np.float32)


def main():
    a = parse()
    is_seq = a.kind != "letters"
    root = KINDS[a.kind]["data"]
    with HandCam(f"Collect {a.kind}") as cam:
        for label in a.labels:
            out = root / label
            out.mkdir(parents=True, exist_ok=True)
            n = count_own(out, a.signer)                       # this signer's clips only -> resumable
            while n < a.per_label:
                if a.auto:
                    key = " " if wait(cam, 1.0, f"{label} {n}/{a.per_label} next clip... (Q=quit)") else "q"
                else:
                    frame, _, _ = cam.read()
                    if frame is None:
                        return
                    cam.show(frame, f"{label} {n}/{a.per_label} | SPACE=record N=next Q=quit")
                    key = cam.flush(frame)
                if key == "q":
                    return
                if key == "n":
                    break
                if key != " ":
                    continue
                prompt = f"Get ready (hands down): {label}" if is_seq else f"Hold {label}..."
                if not wait(cam, 1.2 if a.auto else (2 if is_seq else 1.5), prompt):
                    return
                # sequences keep empty frames (raise hand, sign, lower hand); letters keep only hand frames
                seq = record(cam, label, REC_FRAMES if is_seq else LETTER_FRAMES, keep_empty=is_seq)
                if seq is None:
                    return
                if is_seq:
                    seq = seq[np.linspace(0, REC_FRAMES - 1, SEQ_LEN).astype(int)]
                np.save(out / f"{own_prefix(a.signer)}{n:03d}.npy", seq)
                n += 1


if __name__ == "__main__":
    main()
