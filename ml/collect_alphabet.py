import sys, time
from pathlib import Path
import cv2, numpy as np, mediapipe as mp
from utils import extract_keypoints

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
START = sys.argv[1].upper() if len(sys.argv) > 1 else "A"
FRAMES, CAPTURES = 40, 5
OUT = Path("data/alphabet")
mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)


def grab(hands, text, color=(0, 255, 0)):
    ok, frame = cap.read()
    if not ok:
        cv2.waitKey(1)
        return None
    frame = cv2.flip(frame, 1)
    res = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    if res.multi_hand_landmarks:
        for h in res.multi_hand_landmarks:
            mp_draw.draw_landmarks(frame, h, mp_hands.HAND_CONNECTIONS)
    cv2.putText(frame, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    cv2.imshow("Alphabet", frame)
    return res


with mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5,
                    min_tracking_confidence=0.5) as hands:
    for L in LETTERS[LETTERS.index(START):]:
        d = OUT / L
        d.mkdir(parents=True, exist_ok=True)
        n = len(list(d.glob("*.npy")))
        while n < CAPTURES:
            grab(hands, f"{L} {n}/{CAPTURES} | SPACE=record N=next Q=quit")
            k = cv2.waitKey(1) & 0xFF
            if k == ord("q"):
                cap.release(); cv2.destroyAllWindows(); sys.exit()
            if k == ord("n"):
                break
            if k == 32:
                t0 = time.time()
                while time.time() - t0 < 1.5:
                    grab(hands, f"Hold {L}...", (0, 200, 255))
                    cv2.waitKey(1)
                seq = []
                while len(seq) < FRAMES:
                    r = grab(hands, f"RECORDING {L} {len(seq)}/{FRAMES}", (0, 0, 255))
                    cv2.waitKey(1)
                    if r is not None:
                        seq.append(extract_keypoints(r))
                np.save(d / f"my_{n:03d}.npy", np.array(seq, dtype=np.float32))
                n += 1

cap.release()
cv2.destroyAllWindows()