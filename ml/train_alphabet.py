"""
Train the static A-Z letter classifier (one frame -> letter).

  python collect.py --kind letters      # record first
  python train_alphabet.py --cv         # evaluate: leave-one-capture-out, every capture is the test set once
                                        #   -> models/cv_letters.json (this is the number for the report)
  python train_alphabet.py              # deploy: train on all captures but the last, which only drives early
                                        #   stopping -> models/alphabet.keras (no test score: use --cv)

Frames of one capture are near-identical, so whole captures are held out, never single frames.
"""
import argparse
import json

import numpy as np
import tensorflow as tf
from tensorflow.keras import callbacks, layers, models

from signbridge.augment import augment_frames
from signbridge.config import KINDS, MODELS_DIR
from signbridge.dataset import label_files
from signbridge.keypoints import hand_present

cfg = KINDS["letters"]


def load():
    """-> letters, [(frames, label, capture_index)] with hand-visible frames only"""
    files = label_files(cfg["data"])
    letters, caps = sorted(files), []
    for i, L in enumerate(letters):
        for j, f in enumerate(files[L]):
            fr = np.load(f)
            caps.append((fr[hand_present(fr)], i, j))
    return letters, caps


def n_caps(caps):
    """{label: number of captures}"""
    n = {}
    for _, y, j in caps:
        n[y] = max(n.get(y, 0), j + 1)
    return n


def stack(caps):
    caps = [c for c in caps if len(c[0])]
    return np.concatenate([c[0] for c in caps]), np.concatenate([[c[1]] * len(c[0]) for c in caps])


def split(caps, fold):
    """Capture `fold` of each letter is the test set, the one before it (cyclic) is validation."""
    n = n_caps(caps)
    te_key = {(y, fold % n[y]) for y in n}
    va_key = {(y, (fold - 1) % n[y]) for y in n if n[y] > 2}
    te = [c for c in caps if (c[1], c[2]) in te_key]
    va = [c for c in caps if (c[1], c[2]) in va_key]
    tr = [c for c in caps if (c[1], c[2]) not in te_key | va_key]
    return stack(tr), stack(va or te), stack(te)


def fit(letters, train, val, seed=0):
    tf.random.set_seed(seed)
    Xtr, ytr = train
    rng = np.random.default_rng(seed)
    Xtr = np.concatenate([Xtr] + [augment_frames(Xtr, rng) for _ in range(5)])
    ytr = np.tile(ytr, 6)
    model = models.Sequential([
        layers.Input(shape=(Xtr.shape[1],)),
        layers.Dense(128, activation="relu"), layers.Dropout(0.3),
        layers.Dense(64, activation="relu"),
        layers.Dense(len(letters), activation="softmax"),
    ])
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(Xtr, ytr, validation_data=val, epochs=100, batch_size=32, verbose=0,
              callbacks=[callbacks.EarlyStopping(patience=10, restore_best_weights=True)])
    return model


def cross_validate(letters, caps):
    k = min(max(j for *_, j in caps) + 1, 5)
    accs, worst = [], {}
    for fold in range(k):
        train, val, (Xte, yte) = split(caps, fold)
        pred = fit(letters, train, val, seed=fold).predict(Xte, verbose=0).argmax(axis=1)
        accs.append(float((pred == yte).mean()))
        for t, p in zip(yte, pred):
            if t != p:
                worst[letters[t]] = worst.get(letters[t], 0) + 1
        print(f"fold {fold} (capture {fold} of each letter held out): {accs[-1]:.2%}")
    res = {"method": "leave-one-capture-out", "folds": accs, "mean": float(np.mean(accs)), "std": float(np.std(accs)),
           "most_missed_frames": dict(sorted(worst.items(), key=lambda kv: -kv[1])[:8])}
    print(f"\nLETTERS {k}-fold: {res['mean']:.2%} +/- {res['std']:.2%} | most missed: {res['most_missed_frames']}")
    (MODELS_DIR / "cv_letters.json").write_text(json.dumps(res, indent=1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cv", action="store_true", help="leave-one-capture-out evaluation only (no model saved)")
    args = ap.parse_args()
    letters, caps = load()
    print("letters:", letters)
    MODELS_DIR.mkdir(exist_ok=True)
    if args.cv:
        return cross_validate(letters, caps)
    n = n_caps(caps)                                             # last capture of each letter = early stopping
    train = stack([c for c in caps if c[2] != n[c[1]] - 1])
    val = stack([c for c in caps if c[2] == n[c[1]] - 1])
    print("train frames:", len(train[1]), "| early-stopping frames:", len(val[1]))
    model = fit(letters, train, val)
    model.save(MODELS_DIR / cfg["model"])
    (MODELS_DIR / cfg["labels"]).write_text(json.dumps(letters))
    print("model ->", MODELS_DIR / cfg["model"], "| accuracy for the report: python train_alphabet.py --cv")


if __name__ == "__main__":
    main()
