"""Speech -> text with faster-whisper (CTranslate2 Whisper, int8 on CPU).

The model is loaded lazily on the first request (the "small" model is ~460 MB and is downloaded
once from Hugging Face into ~/.cache/huggingface). Settings via environment variables:

  WHISPER_MODEL    tiny | base | small (default) | medium | large-v3
  WHISPER_DEVICE   cpu (default) | cuda
  WHISPER_COMPUTE  int8 (default) | float16 | float32

task="translate" turns Hindi (or any language) speech into English text, which is what the
English ISL gloss vocabulary needs. task="transcribe" keeps the spoken language.
"""
import io
import os
import threading
import time

try:
    from av.error import FFmpegError as AudioDecodeError   # what PyAV raises for audio it can't read
    from faster_whisper import WhisperModel
except ImportError:          # optional dependency: the sign models work without it
    WhisperModel = None
    AudioDecodeError = ()    # matches nothing

MODEL = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")
LANGUAGES = {"auto": None, "en": "en", "hi": "hi"}
TASKS = {"transcribe", "translate"}

_model = None
_lock = threading.Lock()


def available():
    return WhisperModel is not None


def status():
    return {"available": available(), "model": MODEL, "loaded": _model is not None}


def _get():
    global _model
    with _lock:
        if _model is None:
            _model = WhisperModel(MODEL, device=DEVICE, compute_type=COMPUTE)
    return _model


def preload():
    """Load (and on first run download) the model in the background so the first request is fast."""
    if available() and os.environ.get("WHISPER_PRELOAD", "1") != "0":
        threading.Thread(target=_get, name="whisper-preload", daemon=True).start()


def check(language, task):
    if language not in LANGUAGES:
        raise ValueError(f"language must be one of {sorted(LANGUAGES)}")
    if task not in TASKS:
        raise ValueError(f"task must be one of {sorted(TASKS)}")


def transcribe(audio: bytes, language="auto", task="transcribe"):
    """audio: any container/codec PyAV can decode (webm/opus from MediaRecorder, wav, mp3, m4a...).
    language/task must already be validated with check(). Raises AudioDecodeError for undecodable audio."""
    t0 = time.perf_counter()
    segments, info = _get().transcribe(io.BytesIO(audio), language=LANGUAGES[language], task=task,
                                       beam_size=1, vad_filter=True)
    text = " ".join(s.text.strip() for s in segments).strip()
    return {
        "text": text,
        "language": info.language,
        "languageProbability": round(float(info.language_probability), 3),
        "task": task,
        "audioSeconds": round(float(info.duration), 2),
        "latencyMs": round((time.perf_counter() - t0) * 1000),
        "model": MODEL,
    }
