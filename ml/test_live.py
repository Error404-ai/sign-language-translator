import json, collections
import cv2, numpy as np, mediapipe as mp
import tensorflow as tf
from utils import extract_keypoints

model = tf.keras.models.load_model("models/sign_lstm.keras")
labels = json.load(open("models/labels.json"))
MOTION_MIN = 0.004

BUF = 75                      # ~2.5 s of frames, sampled down to 30 like the training videos
buf = collections.deque(maxlen=BUF)
mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
text, n, motion = "...", 0, 0.0

cap = cv2.VideoCapture(0)
with mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5,
                    min_tracking_confidence=0.5) as hands:
    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if results.multi_hand_landmarks:
            for h in results.multi_hand_landmarks:
                mp_draw.draw_landmarks(frame, h, mp_hands.HAND_CONNECTIONS)
        buf.append(extract_keypoints(results))
        n += 1
        if len(buf) == BUF and n % 5 == 0:
            seq = np.array(buf)[np.linspace(0, BUF - 1, 30).astype(int)][None]
            if (seq != 0).any(axis=2).mean() > 0.5:      # hands visible in most frames
                    present = (seq[0] != 0).any(axis=1)
                    both = present[1:] & present[:-1]
                    d = np.abs(np.diff(seq[0], axis=0)).mean(axis=1)
                    motion = float(d[both].mean()) if both.any() else 0.0
                    p = model.predict(seq, verbose=0)[0]
                    k = p.argmax()
                    ok = p[k] > 0.8 and labels[k] != "idle" and motion > MOTION_MIN
                    text = f"{labels[k]} {p[k]:.0%}" if ok else "..."
            else:
                     text = "..."
        cv2.putText(frame, text, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 255, 0), 3)
        cv2.putText(frame, f"motion {motion:.4f}", (10, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
        cv2.imshow("SignBridge live", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
cap.release()
cv2.destroyAllWindows()