"""Convert one sign video to a (30, 130) keypoint sequence.   python video_to_npy.py in.mp4 out.npy"""
import sys

import cv2
import numpy as np

from signbridge.camera import hands_model
from signbridge.config import FEATURES, SEQ_LEN
from signbridge.keypoints import extract_keypoints


def video_to_sequence(path):
    cap = cv2.VideoCapture(str(path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    wanted = set(np.linspace(0, max(total - 1, 0), SEQ_LEN).astype(int))
    seq = []
    with hands_model() as hands:
        for i in range(total):
            ok, frame = cap.read()
            if not ok:
                break
            if i in wanted:
                frame = cv2.flip(frame, 1)   # selfie view, same as collect.py
                seq.append(extract_keypoints(hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))))
    cap.release()
    while len(seq) < SEQ_LEN:
        seq.append(seq[-1] if seq else np.zeros(FEATURES, dtype=np.float32))
    return np.array(seq, dtype=np.float32)


if __name__ == "__main__":
    out = video_to_sequence(sys.argv[1])
    print(out.shape, "nonzero:", int((out != 0).sum()))
    np.save(sys.argv[2], out)
