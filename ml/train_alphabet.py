import json
from pathlib import Path
import numpy as np
from tensorflow.keras import layers, models, callbacks
from sklearn.metrics import classification_report

DATA = Path("data/alphabet")
letters = sorted(d.name for d in DATA.iterdir() if d.is_dir() and any(d.glob("*.npy")))
print("letters:", letters)

Xtr, ytr, Xte, yte = [], [], [], []
for i, L in enumerate(letters):
    files = sorted((DATA / L).glob("*.npy"))
    for j, f in enumerate(files):
        fr = np.load(f)
        fr = fr[(fr != 0).any(axis=1)]            # drop frames with no hand
        test = j == len(files) - 1                # last capture of each letter = test
        (Xte if test else Xtr).append(fr)
        (yte if test else ytr).extend([i] * len(fr))

Xtr, Xte = np.concatenate(Xtr), np.concatenate(Xte)
ytr, yte = np.array(ytr), np.array(yte)

rng = np.random.default_rng(0)


def augment(X):
    A = X.copy()
    for slot in (0, 1):
        b = slot * 65
        on = (A[:, b:b + 65] != 0).any(axis=1)
        n = int(on.sum())
        if n == 0:
            continue
        A[on, b:b + 63] *= rng.uniform(0.9, 1.1, (n, 1))        # hand size
        A[on, b:b + 63] += rng.normal(0, 0.01, (n, 63))         # small jitter
        A[on, b + 63:b + 65] += rng.normal(0, 0.12, (n, 2))     # hand position in frame
    return A


Xtr = np.concatenate([Xtr] + [augment(Xtr) for _ in range(5)])
ytr = np.tile(ytr, 6)
print("train:", Xtr.shape, "test:", Xte.shape)

model = models.Sequential([
    layers.Input(shape=(130,)),
    layers.Dense(128, activation="relu"), layers.Dropout(0.3),
    layers.Dense(64, activation="relu"),
    layers.Dense(len(letters), activation="softmax"),
])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
model.fit(Xtr, ytr, validation_data=(Xte, yte), epochs=100, batch_size=32,
          callbacks=[callbacks.EarlyStopping(patience=10, restore_best_weights=True)])

pred = model.predict(Xte, verbose=0).argmax(axis=1)
print(classification_report(yte, pred, target_names=letters, zero_division=0))

Path("models").mkdir(exist_ok=True)
model.save("models/alphabet.keras")
json.dump(letters, open("models/alphabet_labels.json", "w"))