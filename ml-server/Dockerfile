# SignBridge ML server: FastAPI + the trained Keras models + Whisper speech-to-text.
# Build from the repo root:  docker build -f ml-server/Dockerfile -t signbridge-ml .
# Runs as uid 1000 and honours $PORT, so the same image works on Hugging Face Spaces (port 7860).
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 \
    TF_CPP_MIN_LOG_LEVEL=2 HF_HOME=/srv/cache MODELS_DIR=/srv/models PORT=8000
RUN useradd -m -u 1000 app && mkdir -p /srv/cache && chown app /srv/cache
WORKDIR /srv
COPY ml-server/requirements.txt .
RUN pip install -r requirements.txt
COPY ml-server/app ./app
COPY ml/models ./models
USER app
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
