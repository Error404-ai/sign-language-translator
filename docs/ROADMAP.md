# SignBridge Roadmap

Status of the project against the B.Tech synopsis (*SignBridge: A Real-Time Bidirectional Indian Sign Language Translation System*, Oct 2026) and the plan for what is left.

_Last updated: 16 Nov 2026_

---

## ✅ Done

| Area | What exists | Where |
|---|---|---|
| Hand tracking | MediaPipe Hands in Python and in the browser, both producing the same 130-d normalised keypoints (unit-tested for parity) | `ml/signbridge/keypoints.py`, `frontend/js/recognizer.js` |
| Dataset pipeline | INCLUDE video → `.npy` extraction (resumable) plus webcam recorders for words, letters and trends | `ml/extract_dataset.py`, `ml/collect.py` |
| Word model | 2-layer LSTM with time/scale/jitter augmentation and class weights. **40 ISL signs + idle**, 88.5 % ± 3.2 % in 5-fold CV (21 Nov: team data + 460 INCLUDE videos via `fetch_include.py`) | `ml/train.py`, `ml/models/sign_lstm.keras` |
| Letter model | Dense MLP over single frames for the 26 static A–Z letters. **96.0 % ± 3.8 %** leave-one-recording-out (`train_alphabet.py --cv`); one signer only | `ml/train_alphabet.py`, `ml/models/alphabet.keras` |
| Metrics | Accuracy, per-class precision/recall/F1 and confusion matrix, saved as `models/metrics_*.json` on every training run | `ml/signbridge/metrics.py` |
| ML server | FastAPI with a model registry: `/health`, `/predict`, `/predict-letter`, `/predict-trend` (optional model) | `ml-server/app/` |
| Backend | Express: health, prediction proxies (all three modes), history store, ISL-gloss text → sign | `backend/src/` |
| Sign → Text UI | Live webcam, motion-based clip segmentation, **Words / Letters / Trends** modes, sentence builder, text-to-speech | `frontend/js/modes/` |
| **Trends mode (new)** | 13 social-media gestures (Clock it, 6-7, heart hands, muscle heart, saranghae (Korean finger heart), peace, rock on, shaka, ILY, OK, 👍, 👎, L on forehead). Hybrid: geometry/motion rules work today, and a trained LSTM takes over when available | `frontend/js/trends/`, `ml/collect.py --kind trends` |
| Text/Speech → Sign UI | Whisper mic (English, Hindi → English) with Web Speech fallback, gloss tokens (sign or fingerspell), 2D skeleton hand player | `frontend/js/text-to-sign.js`, `hand-player.js` |
| Tests / CI | 39 Node tests (+ MongoDB contract test with `MONGO_URL`) (gloss, API against a fake ML server, recognizer, trend rules, Python↔JS keypoint parity) and a GitHub Actions workflow | `backend/test/`, `frontend/test/`, `.github/workflows/ci.yml` |

## ⏳ Left

| # | Item | Synopsis ref | Current state | Phase |
|---|---|---|---|---|
| 1 | Vocabulary of 25–50 ISL signs | §1.5 | 54 chosen; **40 trained** ✅; 14 need recording | B |
| 2 | Signer-independent evaluation with ≥ 85 % accuracy | §1.3, §5.4.1 | Random-split CV 88.5 % on 40 signs (≥ 85 % ✅). `--split signer` implemented; needs multi-signer data | B |
| 3 | Measured end-to-end latency ≤ 280 ms | §1.2 | ✅ p50 88 ms / p95 120 ms capture → paint (`/api/latency`) | D |
| 4 | Whisper speech-to-text (multilingual, Hindi) | §5.2.2 | ✅ Done (faster-whisper small, ~1.2 s per utterance on CPU) | C |
| 5 | MongoDB storage | §5.5 | ✅ Done (`MONGO_URL`; JSON fallback) | C |
| 6 | WebSocket real-time channel | Abstract | ✅ `/ws`, auto-reconnect, HTTP fallback | D |
| 7 | 3D avatar (Three.js) | §5.2.1 | ✅ 3D hand (joints, bones, palm), eased motion, drag to rotate; 2D fallback | D |
| 8 | Usability study and baseline comparison (INCLUDE paper) | §5.4.2 | Kit + scoring ready (`docs/study/`), comparison table drafted (`docs/COMPARISON.md`); study to run, INCLUDE numbers to copy | E |
| 9 | Cloud deployment | §1.5 | ✅ Deployable: `docker compose up` runs everything (tested). **Team decision (22 Nov): demo locally, not hosted online.** HF Spaces / Render steps kept in `docs/DEPLOY.md` | E |
| 10 | React / Next.js frontend | §1.3.3 | Vanilla JS modules (map 1:1 to components) | F (optional) |
| 11 | Conference paper and final report | §6.2 | — | F |

---

## Execution plan

Dates follow the synopsis Gantt chart (integration in Nov, testing in Dec, documentation in Jan).

### Phase B: Vocabulary and evaluation (11 – 23 Nov) · 🟡 40 signs trained, recording left
- [x] 54-sign vocabulary in `ml/signs.txt`: 40 available in INCLUDE, 14 to record.
- [x] 20 Nov: recovered `ml/data` from the team (216 greeting clips, 100 INCLUDE adjective clips, 130 alphabet captures). Retrained on **15 signs + idle**: 5-fold CV **95.6 % ± 1.8 %**, held-out split 96.9 %. Hand-player poses exported for the 6 new signs. Results in `models/metrics_words.json` and `models/cv_words.json`.
- [x] 20–21 Nov: `ml/fetch_include.py` streams only the chosen INCLUDE videos (reads zip indexes over HTTP, never the 57 GB). Added 25 signs (460 videos). Retrained on **40 signs + idle**: 5-fold CV **88.5 % ± 3.2 %** (22 signs: 90.6 %), held-out split 87.2 %, macro F1 0.86. A BiLSTM was tried (88.3 %) and not used. Text-to-sign maps plurals to the singular sign.
- [x] `collect.py --signer NAME --list signs.txt`: tags every clip with who signed it, records the whole list + idle, resumable.
- [x] `train.py --split signer [--holdout NAME]`: holds out whole signers → `metrics_words_signer.json`; random split → `metrics_words.json`. Early stopping now uses a validation set carved from training data, never the test set.
- [x] `export_poses.py` falls back to own recordings for signs INCLUDE lacks, and merges into `poses.json` instead of overwriting it.
- [ ] Each of the 4 team members records 15 clips per sign (~30–40 min each): `python collect.py --signer <name> --auto 15 --list signs.txt`.
- [ ] Record the 14 signs INCLUDE lacks, merge everyone's `data/landmarks/`, run the signer-split evaluation, then train the deployed model and `export_poses.py`.
- **Done when:** signer-independent accuracy is ≥ 85 % on all 54 signs.

### Phase C: Whisper and MongoDB (24 Nov – 7 Dec) · ✅ done 16 Nov
- [x] `ml-server`: `POST /transcribe` using `faster-whisper` (`small`, int8 on CPU), `language` = `en` / `hi` / `auto`. Hindi uses Whisper's `translate` task so the text maps onto the English sign vocabulary. Model preloads in the background.
- [x] Backend: `POST /api/transcribe` (raw audio in, multipart to the ML server). Frontend `speech.js`: record with `MediaRecorder` (click to start/stop, 15 s cap), English / हिन्दी selector, falls back to the Web Speech API.
- [x] Backend: `services/mongoStore.js` (official `mongodb` driver) implementing `add / list / clear`, keeps the newest 500. Used when `MONGO_URL` is set; falls back to the JSON store if MongoDB is unreachable. `/api/health` reports `history: mongo|json` and `whisper`.
- Measured: English and Hindi→English sentences transcribed correctly in ~1.1–1.3 s (CPU, Apple Silicon), verified through the browser UI.
- **Done when:** speech → signs works in Firefox and Safari, and Hindi sentences transcribe.

### Phase D: Real-time and avatar (8 – 21 Dec) · ✅ done 16 Nov
- [x] WebSocket (`ws`) on the backend at `/ws`, sharing the HTTP prediction code. The browser sends clips (and letter frames) over one socket with auto-reconnect, and falls back to HTTP when the socket is down.
- [x] Latency probe: frame capture → result painted, per prediction, split into MediaPipe / network / backend / ML inference / paint, plus the segmenter's end-of-sign wait. Live p50/p95 in the debug panel; `GET /api/latency` for the report.
- [x] Three.js avatar: 3D hand (sphere joints, capsule bones, filled palm) driven by the same 130-d frames as `poses.json`; eased motion between frames, auto-framing, drag to rotate; 2D skeleton fallback without WebGL.
- **Result:** p50 **88 ms**, p95 **120 ms** capture → text (MacBook, Chrome, WebSocket); the avatar plays every gloss token (signs and fingerspelling).

### Phase E: Validation and deployment (22 Dec – 10 Jan) · 🟡 tooling done 22 Nov, study left
- [x] Study kit: protocol, 7 tasks, SUS, consent script, `results_template.csv`, `score.py` (`docs/study/`).
- [ ] Run the usability test with about 10 participants (deaf/HoH if possible).
- [x] Comparison table `docs/COMPARISON.md` (Camgöz et al. numbers verified from arXiv).
- [ ] Fill in the INCLUDE paper's own accuracy from the ACM PDF (library access).
- [x] Docker: `backend/Dockerfile` (API + WebSocket + web page on one port), `ml-server/Dockerfile`, `docker-compose.yml` (+ optional MongoDB), `docs/DEPLOY.md`.
- [x] ~~Put it online~~: not needed, the team demos locally (22 Nov). The guide stays in `docs/DEPLOY.md` in case it's needed later.
- [x] Letters: honest evaluation (`train_alphabet.py --cv`, leave-one-recording-out) **96.0 % ± 3.8 %**. The old 100 % used the test recording for early stopping.

### Phase F: Write-up (Jan 2027)
- [ ] Optional React (Vite) port. Each `frontend/js/modes/*.js` becomes a component and `ui.js` becomes state.
- [ ] Conference paper draft, then final report.

---

## Synopsis errata (fix before the next submission)
- The Fig 1.1 caption says "contamination detection delay". It should describe communication delay.
- "accuracy exceeding 85" is missing "%" on pp. 2, 3 and 4.
- The PRISMA numbers disagree: the text says 132 retrieved / 41 shortlisted, the figure says 146 / 39.
- The synopsis says 24 papers were reviewed, but the bibliography lists 8.
- §5.5 lists React, and §1.3.3 lists Next.js and MERN. Make these consistent with what is actually built.
