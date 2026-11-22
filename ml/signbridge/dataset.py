"""Loading .npy samples and working out who signed each one (for signer-independent evaluation).

File naming:
  my_<signer>_###.npy   recorded with  collect.py --signer <signer>
  my_###.npy            older own recordings (signer "me")
  anything else         dataset clips (INCLUDE). Signer comes from <data>/signers.csv
                        ("clip_stem,signer" per line) if present, otherwise "include".
"""
import csv
import re
from pathlib import Path

_TAGGED = re.compile(r"^my_([a-z][a-z0-9-]*)_\d+$")
_PLAIN = re.compile(r"^my_\d+$")


def clean_signer(name):
    s = re.sub(r"[^a-z0-9-]", "-", name.strip().lower()).strip("-")
    if not s or not s[0].isalpha():
        raise ValueError(f"signer name must start with a letter: {name!r}")
    return s


def own_prefix(signer=None):
    """Filename prefix for your own recordings."""
    return f"my_{clean_signer(signer)}_" if signer else "my_"


def count_own(folder: Path, signer=None):
    pat = re.compile(rf"^{re.escape(own_prefix(signer))}\d+$")
    return sum(1 for f in folder.glob("my_*.npy") if pat.match(f.stem))


def signer_map(root: Path):
    f = root / "signers.csv"
    if not f.exists():
        return {}
    with open(f, newline="") as fh:
        return {r[0].strip(): clean_signer(r[1]) for r in csv.reader(fh) if len(r) >= 2 and r[0].strip()}


def signer_of(path: Path, mapping=None):
    stem = path.stem
    if m := _TAGGED.match(stem):
        return m[1]
    if _PLAIN.match(stem):
        return "me"
    return (mapping or {}).get(stem, "include")


def is_own(path: Path):
    return path.stem.startswith("my_")


def label_files(root: Path):
    """{label: [files]} for every non-empty label folder."""
    files = {d.name: sorted(d.glob("*.npy")) for d in sorted(root.iterdir()) if d.is_dir()}
    return {k: v for k, v in files.items() if v}


def norm_label(text):
    """'Thank You' -> 'thank_you'"""
    return text.strip().lower().replace(" ", "_")


def label_of_folder(name):
    """Dataset folder name -> label: '12. Thank You' -> 'thank_you' (INCLUDE numbers its folders)."""
    return norm_label(re.sub(r"^\d+\.\s*", "", name))


def read_list(path):
    """Label list file: one per line, '#' comments allowed, spaces -> underscores."""
    lines = (line.split("#", 1)[0].strip() for line in Path(path).read_text().splitlines())
    return [norm_label(line) for line in lines if line]
