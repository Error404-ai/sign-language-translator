import json
from pathlib import Path
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
import tensorflow as tf
from tensorflow.keras import layers, models, callbacks

DATA = Path("data/landmarks")
signs = sorted(d.name for d in DATA.iterdir() if d.is_dir() and any(d.glob("*.npy")))
print("signs:", signs)

X, y = [], []
for i, s in enumerate(signs):
    for f in (DATA / s).glob("*.npy"):
        X.append(np.load(f)); y.append(i)
X = np.array(X, dtype=np.float32)      # (N, 30, 130)
y = np.array(y)
print("data:", X.shape, "per class:", np.bincount(y))

Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

cw = compute_class_weight("balanced", classes=np.unique(ytr), y=ytr)
cw = dict(enumerate(cw))

model = models.Sequential([
    layers.Input(shape=X.shape[1:]),
    layers.LSTM(64, return_sequences=True),
    layers.LSTM(128),
    layers.Dense(64, activation="relu"),
    layers.Dropout(0.3),
    layers.Dense(len(signs), activation="softmax"),
])
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])

model.fit(Xtr, ytr, validation_data=(Xte, yte), epochs=200, batch_size=8,
          class_weight=cw,
          callbacks=[callbacks.EarlyStopping(patience=25, restore_best_weights=True)])

loss, acc = model.evaluate(Xte, yte, verbose=0)
print(f"\nTEST ACCURACY: {acc:.2%} on {len(yte)} samples")

Path("models").mkdir(exist_ok=True)
model.save("models/sign_lstm.keras")
json.dump(signs, open("models/labels.json", "w"))