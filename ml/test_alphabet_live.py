import json, collections
import cv2, numpy as np, mediapipe as mp
import tensorflow as tf
from utils import extract_keypoints

model = tf.keras.models.load_model("models/alphabet.keras")
letters = json.load(open("models/alphabet_labels.json"))
recent = collections.deque(maxlen=8)          # smooth over the last 8 frames
mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

with mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5,
                    min_tracking_confidence=0.5) as hands:
    while True:
        ok, frame = cap.read()
        if not ok:
            cv2.waitKey(1)
            continue
        frame = cv2.flip(frame, 1)
        res = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        text = "..."
        if res.multi_hand_landmarks:
            for h in res.multi_hand_landmarks:
                mp_draw.draw_landmarks(frame, h, mp_hands.HAND_CONNECTIONS)
            p = model.predict(extract_keypoints(res)[None], verbose=0)[0]
            k = int(p.argmax())
            recent.append(letters[k] if p[k] > 0.8 else None)
            top = collections.Counter(recent).most_common(1)[0]
            if top[0] and top[1] >= 5:
                text = f"{top[0]}  {p[k]:.0%}"
        else:
            recent.clear()
        cv2.putText(frame, text, (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 255, 0), 3)
        cv2.imshow("Alphabet live", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
cap.release()
cv2.destroyAllWindows()