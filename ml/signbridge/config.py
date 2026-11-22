import os
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent.parent
# Both can be overridden (e.g. a shared drive with the team's recordings, or a scratch dir for experiments)
DATA_DIR = Path(os.environ.get("SIGNBRIDGE_DATA", ML_DIR / "data"))
MODELS_DIR = Path(os.environ.get("SIGNBRIDGE_MODELS", ML_DIR / "models"))

SEQ_LEN = 30          # frames per sample fed to the sequence models
FEATURES = 130        # 2 hands x (21 landmarks x 3 + wrist x,y)
HAND_DIM = 65

# --kind -> where the raw .npy samples live and which model files it produces
KINDS = {
    "words":   {"data": DATA_DIR / "landmarks", "model": "sign_lstm.keras",  "labels": "labels.json"},
    "trends":  {"data": DATA_DIR / "trends",    "model": "trends_lstm.keras", "labels": "trends_labels.json"},
    "letters": {"data": DATA_DIR / "alphabet",  "model": "alphabet.keras",   "labels": "alphabet_labels.json"},
}
