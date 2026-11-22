from pydantic import BaseModel


class SequenceRequest(BaseModel):
    sequence: list[list[float]]   # 30 frames x 130 values


class FrameRequest(BaseModel):
    keypoints: list[float]        # 130 values (one frame)
