import time
from pathlib import Path

import cv2
import numpy as np
import mediapipe as mp
from utils import extract_keypoints

SIGNS = ["hello", "thank_you", "yes", "no", "please"]   # edit this list
SEQ_LEN = 30        # frames per sample (about 1 second)
PER_SIGN = 30       # samples to record per sign
OUT = Path("data/landmarks")

mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils


def read(cap, hands):
    ok, frame = cap.read()
    if not ok:
        return None, None
    frame = cv2.flip(frame, 1)                       # selfie view
    results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    if results.multi_hand_landmarks:
        for h in results.multi_hand_landmarks:
            mp_draw.draw_landmarks(frame, h, mp_hands.HAND_CONNECTIONS)
    return frame, results


def show(frame, text, color=(0, 255, 0)):
    cv2.putText(frame, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    cv2.imshow("Collect", frame)


def main():
    cap = cv2.VideoCapture(0)
    with mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5,
                        min_tracking_confidence=0.5) as hands:
        for sign in SIGNS:
            d = OUT / sign
            d.mkdir(parents=True, exist_ok=True)
            n = len(list(d.glob("*.npy")))           # resume where you stopped
            while n < PER_SIGN:
                frame, results = read(cap, hands)
                if frame is None:
                    return
                show(frame, f"{sign} {n}/{PER_SIGN} | SPACE=record N=next sign Q=quit")
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    cap.release(); cv2.destroyAllWindows(); return
                if key == ord("n"):
                    break
                if key == 32:
                    t0 = time.time()
                    while time.time() - t0 < 2:      # 2 second countdown
                        frame, _ = read(cap, hands)
                        show(frame, f"Get ready: {sign}", (0, 200, 255))
                        cv2.waitKey(1)
                    seq = []
                    while len(seq) < SEQ_LEN:
                        frame, results = read(cap, hands)
                        seq.append(extract_keypoints(results))
                        show(frame, f"RECORDING {sign} {len(seq)}/{SEQ_LEN}", (0, 0, 255))
                        cv2.waitKey(1)
                    np.save(d / f"{n:03d}.npy", np.array(seq))
                    n += 1
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()