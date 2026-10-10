import sys
import cv2
import numpy as np
import mediapipe as mp
from utils import extract_keypoints

mp_hands = mp.solutions.hands
SEQ_LEN = 30   # same as collect_data.py

def video_to_sequence(path):
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    idxs = set(np.linspace(0, total - 1, SEQ_LEN).astype(int))
    seq = []
    with mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5,
                        min_tracking_confidence=0.5) as hands:
        for i in range(total):
            ok, frame = cap.read()
            if not ok:
                break
            if i in idxs:
                frame = cv2.flip(frame, 1)   # selfie view, same as collect_data.py
                results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                seq.append(extract_keypoints(results))
    cap.release()
    while len(seq) < SEQ_LEN:
        seq.append(seq[-1] if seq else np.zeros(130, dtype=np.float32))
    return np.array(seq, dtype=np.float32)   # (30, 130)

if __name__ == "__main__":
    out = video_to_sequence(sys.argv[1])
    print(out.shape, "nonzero:", (out != 0).sum())
    np.save(sys.argv[2], out)