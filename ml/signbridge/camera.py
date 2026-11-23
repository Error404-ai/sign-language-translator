"""Cross-platform webcam + MediaPipe Hands loop shared by the collect / live-test scripts."""
import platform

import cv2
import mediapipe as mp

from .keypoints import extract_keypoints

mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils

GREEN, ORANGE, RED, CYAN = (0, 255, 0), (0, 200, 255), (0, 0, 255), (255, 255, 0)


def open_camera(index=0, width=640, height=480):
    if platform.system() == "Windows":            # DirectShow + MJPG avoids slow/black frames on Windows
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    else:
        cap = cv2.VideoCapture(index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    if not cap.isOpened():
        raise SystemExit("Could not open the webcam (check camera permissions).")
    return cap


def hands_model():
    return mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5, min_tracking_confidence=0.5)


class HandCam:
    """with HandCam("title") as cam: frame, kp = cam.read()  -> mirrored frame with skeleton drawn."""

    def __init__(self, title="SignBridge", index=0):
        self.title, self.index, self.fails = title, index, 0

    def __enter__(self):
        self.cap = open_camera(self.index)
        self.hands = hands_model().__enter__()
        return self

    def __exit__(self, *exc):
        self.hands.__exit__(*exc)
        self.cap.release()
        cv2.destroyAllWindows()

    def read(self):
        """Returns (frame, keypoints, results) or (None, None, None) after 30 failed reads."""
        while True:
            ok, frame = self.cap.read()
            if ok:
                self.fails = 0
                break
            self.fails += 1
            cv2.waitKey(1)
            if self.fails > 30:
                return None, None, None
        frame = cv2.flip(frame, 1)                 # selfie view, same as training data
        results = self.hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        for h in results.multi_hand_landmarks or []:
            mp_draw.draw_landmarks(frame, h, mp_hands.HAND_CONNECTIONS)
        return frame, extract_keypoints(results), results

    def show(self, frame, text, color=GREEN, line=0, scale=0.7):
        cv2.putText(frame, text, (10, 30 + 36 * line), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 2)

    def flush(self, frame):
        """Display the frame; returns the pressed key (lower-case char) or ''."""
        cv2.imshow(self.title, frame)
        k = cv2.waitKey(1) & 0xFF
        return chr(k).lower() if k != 255 else ""
