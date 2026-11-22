"""SignBridge ML inference server.   uvicorn app.main:app --port 8000   (run inside ml-server/)"""
import time

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from . import speech
from .registry import load_all
from .schemas import FrameRequest, SequenceRequest

models = load_all()
speech.preload()

app = FastAPI(title="SignBridge ML server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def run(name, x):
    clf = models.get(name)
    if clf is None:
        raise HTTPException(404, f"no '{name}' model trained yet")
    try:
        t0 = time.perf_counter()
        out = clf.predict(x)
        return {**out, "inferenceMs": round((time.perf_counter() - t0) * 1000, 1)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/health")
def health():
    labels = lambda n: models[n].labels if n in models else []
    return {"status": "ok", "signs": labels("words"), "letters": labels("letters"),
            "trends": labels("trends"), "trendsModel": "trends" in models, "whisper": speech.status()}


@app.post("/predict")
def predict(req: SequenceRequest):
    return run("words", req.sequence)


@app.post("/predict-letter")
def predict_letter(req: FrameRequest):
    return run("letters", req.keypoints)


@app.post("/predict-trend")
def predict_trend(req: SequenceRequest):
    return run("trends", req.sequence)


MAX_AUDIO = 25 * 1024 * 1024


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form("auto"), task: str = Form("transcribe")):
    """Multipart upload: audio=<file>, language=auto|en|hi, task=transcribe|translate."""
    if not speech.available():
        raise HTTPException(503, "Whisper not installed: pip install faster-whisper python-multipart")
    try:
        speech.check(language, task)
    except ValueError as e:
        raise HTTPException(400, str(e))
    data = await audio.read()
    if not data:
        raise HTTPException(400, "empty audio")
    if len(data) > MAX_AUDIO:
        raise HTTPException(413, "audio larger than 25 MB")
    try:
        return await run_in_threadpool(speech.transcribe, data, language, task)
    except speech.AudioDecodeError as e:       # client sent something that isn't audio; anything else is a 500
        raise HTTPException(422, f"could not decode audio ({type(e).__name__})")
