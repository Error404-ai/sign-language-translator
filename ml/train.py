"""
Train the sequence (LSTM) classifier for word signs or trend gestures.

  python train.py --signs signs.txt                    # deploy: the vocabulary in signs.txt, random 80/20 split
  python train.py --signs signs.txt --split signer     # evaluate on people the model has never seen
  python train.py --signs signs.txt --split signer --holdout tushar
  python train.py --top 30                             # 30 signs with the most samples (+ idle)
  python train.py --kind trends                        # social-media gestures from data/trends/

Splits
  random  80/20 stratified. Same people in train and test, so the number is optimistic.
  signer  whole signers are held out (collect.py --signer NAME tags each clip). This is the
          number the synopsis asks for (>= 85 %). The model is NOT saved unless --save is given,
          so evaluating never replaces the deployed model with one trained on less data.

Validation for early stopping is taken from the training part, never from the test set.
Writes models/<model>.keras, models/<labels>.json and models/metrics_<kind>[_signer].json.
"""
import argparse
import json
from collections import Counter

import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from tensorflow.keras import callbacks, layers, models

from signbridge.augment import augment_sequence
from signbridge.config import KINDS, MODELS_DIR
from signbridge.dataset import is_own, label_files, read_list, signer_map, signer_of
from signbridge.metrics import report

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--kind", choices=["words", "trends"], default="words")
ap.add_argument("--top", type=int, default=40)
ap.add_argument("--signs", default=None, help="text file with one label per line")
ap.add_argument("--min-samples", type=int, default=8)
ap.add_argument("--epochs", type=int, default=150)
ap.add_argument("--split", choices=["random", "signer"], default="random")
ap.add_argument("--holdout", default=None, help="signer split: comma-separated signers to test on (default: auto)")
ap.add_argument("--save", action="store_true", help="signer split: also save the model")
args = ap.parse_args()
cfg = KINDS[args.kind]


def select_labels(files):
    if args.signs:
        wanted = read_list(args.signs)
        missing = [w for w in wanted if w not in files]
        if missing:
            print("WARNING no data for:", missing)
        chosen = {w for w in wanted if w in files}
    else:
        chosen = set(sorted((k for k in files if k != "idle"), key=lambda k: -len(files[k]))[:args.top])
    chosen |= {"idle"} & files.keys()
    thin = sorted(s for s in chosen if len(files[s]) < args.min_samples and s != "idle")
    if thin:
        print(f"WARNING dropped (< {args.min_samples} samples):", thin)
    return sorted(s for s in chosen if s not in thin)


def load():
    root = cfg["data"]
    files, mapping = label_files(root), signer_map(root)
    labels = select_labels(files)
    X, y, own, who = [], [], [], []
    for i, s in enumerate(labels):
        for f in files[s]:
            X.append(np.load(f)); y.append(i); own.append(is_own(f)); who.append(signer_of(f, mapping))
    return labels, np.array(X, dtype=np.float32), np.array(y), np.array(own), np.array(who)


def build(input_shape, n_classes):
    m = models.Sequential([
        layers.Input(shape=input_shape),
        layers.LSTM(64, return_sequences=True, dropout=0.2),
        layers.LSTM(128, dropout=0.2),
        layers.Dense(64, activation="relu"),
        layers.Dropout(0.4),
        layers.Dense(n_classes, activation="softmax"),
    ])
    m.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return m


def split_safe(idx, y, size, seed):
    """Stratified when every class has >= 2 samples, plain random otherwise."""
    try:
        return train_test_split(idx, test_size=size, stratify=y[idx], random_state=seed)
    except ValueError:                  # a class with 1 sample, or fewer test slots than classes
        return train_test_split(idx, test_size=size, random_state=seed)


def pick_holdout(who, y, n_labels):
    """Auto: the signer who covers the most labels; ties -> the one closest to 20 % of the data."""
    signers = sorted(set(who))
    if len(signers) < 2:
        raise SystemExit(f"--split signer needs clips from >= 2 signers, found {signers}. "
                         "Record with: python collect.py --signer <name> ...")
    cover = {s: len(set(y[who == s])) for s in signers}
    share = {s: (who == s).mean() for s in signers}
    best = max(signers, key=lambda s: (cover[s], -abs(share[s] - 0.2)))
    if cover[best] < n_labels:
        print(f"WARNING held-out signer '{best}' only has {cover[best]}/{n_labels} labels")
    return [best]


def main():
    if not cfg["data"].exists():
        raise SystemExit(f"No data in {cfg['data']} - record some with collect.py --kind {args.kind}")
    labels, X, y, own, who = load()
    print("labels:", len(labels), labels)
    print("data:", X.shape, "own recordings:", int(own.sum()),
          "min/max per class:", np.bincount(y).min(), np.bincount(y).max())
    signers = dict(Counter(who.tolist()))
    print("signers:", signers)

    idx = np.arange(len(X))
    extra = {"split": args.split, "signers": signers}
    if args.split == "signer":
        hold = [h.strip().lower() for h in args.holdout.split(",")] if args.holdout else pick_holdout(who, y, len(labels))
        unknown = set(hold) - set(who)
        if unknown:
            raise SystemExit(f"unknown signer(s) {sorted(unknown)}; have {sorted(set(who))}")
        test_mask = np.isin(who, hold)
        te, rest = idx[test_mask], idx[~test_mask]
        if len(rest) == 0:
            raise SystemExit("nothing left to train on")
        missing = [labels[i] for i in range(len(labels)) if i not in set(y[rest])]
        if missing:
            print("WARNING these labels only exist for the held-out signer (can't be learned):", missing)
        print(f"held-out signer(s): {hold} -> {len(te)} test clips")
        extra["holdout"] = hold
    else:
        rest, te = split_safe(idx, y, 0.2, 42)
    tr, va = split_safe(rest, y, 0.15, 7)

    rng = np.random.default_rng(0)
    Xa, ya = [X[tr]], [y[tr]]
    for i in tr:
        k = 12 if own[i] else 4
        Xa.append(np.stack([augment_sequence(X[i], rng) for _ in range(k)])); ya.append(np.full(k, y[i]))
    Xtr, ytr = np.concatenate(Xa).astype(np.float32), np.concatenate(ya)
    print(f"train {len(tr)} clips ({len(Xtr)} after augmentation) | val {len(va)} | test {len(te)}")

    present = np.unique(ytr)
    w = compute_class_weight("balanced", classes=present, y=ytr)
    cw = {int(c): float(v) for c, v in zip(present, w)}
    model = build(X.shape[1:], len(labels))
    model.fit(Xtr, ytr, validation_data=(X[va], y[va]), epochs=args.epochs, batch_size=16, class_weight=cw,
              callbacks=[callbacks.EarlyStopping(patience=20, restore_best_weights=True, monitor="val_loss"),
                         callbacks.ReduceLROnPlateau(patience=8, factor=0.5)])

    Xte, yte = X[te], y[te]
    p = model.predict(Xte, verbose=0)
    pred = p.argmax(axis=1)
    top3 = float(np.mean([t in row.argsort()[-3:] for t, row in zip(yte, p)]))
    acc = float((pred == yte).mean())
    print(f"\nTEST ACCURACY ({args.split} split): {acc:.2%} | top-3: {top3:.2%} on {len(yte)} samples")
    if args.split == "random":
        print("(optimistic: the same signers are in train and test - use --split signer for the report number)")
    else:
        print(f"synopsis target >= 85 %: {'MET' if acc >= 0.85 else 'not yet'}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    suffix = "_signer" if args.split == "signer" else ""
    extra.update(top3_accuracy=top3, train_clips=int(len(tr)), val_clips=int(len(va)))
    report(yte, pred, labels, MODELS_DIR / f"metrics_{args.kind}{suffix}.json", extra)
    if args.split == "random" or args.save:
        model.save(MODELS_DIR / cfg["model"])
        (MODELS_DIR / cfg["labels"]).write_text(json.dumps(labels))
        print("model ->", MODELS_DIR / cfg["model"])
    else:
        print("model not saved (evaluation run) - add --save to keep it")


if __name__ == "__main__":
    tf.random.set_seed(0)
    main()
