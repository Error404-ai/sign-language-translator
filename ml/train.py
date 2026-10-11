"""
python train.py --top 30                  # 30 signs with the most samples (+ idle)
python train.py --signs signs.txt         # exact list, one sign per line (the 25-50 from the synopsis)
Your own recordings (my_*.npy) are augmented more heavily so the model adapts to YOUR webcam.
"""
import argparse, json
from pathlib import Path
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import classification_report, confusion_matrix
import tensorflow as tf
# from sklearn.metrics import confusion_matrix
from tensorflow.keras import layers, models, callbacks

ap = argparse.ArgumentParser()
ap.add_argument("--top", type=int, default=40)
ap.add_argument("--signs", default=None)
ap.add_argument("--min-samples", type=int, default=8)
ap.add_argument("--epochs", type=int, default=150)
args = ap.parse_args()

DATA = Path("data/landmarks")
files = {d.name: sorted(d.glob("*.npy")) for d in DATA.iterdir() if d.is_dir()}
files = {k: v for k, v in files.items() if v}

if args.signs:
    wanted = [l.strip().lower().replace(" ", "_") for l in open(args.signs) if l.strip()]
    missing = [w for w in wanted if w not in files]
    if missing:
        print("WARNING no data for:", missing)
    signs = sorted(set(w for w in wanted if w in files) | ({"idle"} & files.keys()))
else:
    ranked = sorted((k for k in files if k != "idle"), key=lambda k: -len(files[k]))[:args.top]
    signs = sorted(set(ranked) | ({"idle"} & files.keys()))
signs = [s for s in signs if len(files[s]) >= args.min_samples or s == "idle"]
print("signs:", len(signs), signs)

X, y, mine = [], [], []
for i, s in enumerate(signs):
    for f in files[s]:
        X.append(np.load(f)); y.append(i); mine.append(f.name.startswith("my_"))
X = np.array(X, dtype=np.float32); y = np.array(y); mine = np.array(mine)
print("data:", X.shape, "own recordings:", int(mine.sum()), "min/max per class:", np.bincount(y).min(), np.bincount(y).max())

idx = np.arange(len(X))
tr, te = train_test_split(idx, test_size=0.2, stratify=y, random_state=42)
rng = np.random.default_rng(0)


def augment(x):
    """x: (30,130). Trim/stretch in time, shift framing, rescale, jitter. Zeros (no hand) stay zero."""
    T = x.shape[0]
    s = rng.integers(0, 5); e = T - 1 - rng.integers(0, 5)
    x = x[np.round(np.linspace(s, e, T)).astype(int)].copy()
    for slot in (0, 1):
        b = slot * 65
        on = (x[:, b:b + 65] != 0).any(axis=1)
        if not on.any():
            continue
        x[on, b:b + 63] = x[on, b:b + 63] * rng.uniform(0.93, 1.07) + rng.normal(0, 0.012, (on.sum(), 63))
        x[on, b + 63:b + 65] += rng.normal(0, 0.05, 2)           # different camera framing
    return x


Xa, ya = [X[tr]], [y[tr]]
for i in tr:
    for _ in range(12 if mine[i] else 4):
        Xa.append(augment(X[i])[None]); ya.append(np.array([y[i]]))
Xtr = np.concatenate(Xa).astype(np.float32); ytr = np.concatenate(ya)
Xte, yte = X[te], y[te]
print("train samples after augmentation:", len(Xtr))

cw = dict(enumerate(compute_class_weight("balanced", classes=np.arange(len(signs)), y=ytr)))

model = models.Sequential([
    layers.Input(shape=X.shape[1:]),
    layers.LSTM(64, return_sequences=True, dropout=0.2),
    layers.LSTM(128, dropout=0.2),
    layers.Dense(64, activation="relu"),
    layers.Dropout(0.4),
    layers.Dense(len(signs), activation="softmax"),
])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
model.fit(Xtr, ytr, validation_data=(Xte, yte), epochs=args.epochs, batch_size=16, class_weight=cw,
          callbacks=[callbacks.EarlyStopping(patience=20, restore_best_weights=True, monitor="val_loss"),
                     callbacks.ReduceLROnPlateau(patience=8, factor=0.5)])

p = model.predict(Xte, verbose=0)
pred = p.argmax(axis=1)
top3 = np.mean([yt in row.argsort()[-3:] for yt, row in zip(yte, p)])
print(f"\nTEST ACCURACY: {(pred == yte).mean():.2%} | top-3: {top3:.2%} on {len(yte)} samples")
print("(optimistic: same signers can appear in train and test; real webcam accuracy is what matters)")

Path("models").mkdir(exist_ok=True)
model.save("models/sign_lstm.keras")
json.dump(signs, open("models/labels.json", "w"))
print(confusion_matrix(yte, pred))
