# Deploying SignBridge

There are two containers:

| Image | Dockerfile | Contains | Size |
|---|---|---|---|
| **app** | [`backend/Dockerfile`](../backend/Dockerfile) | Express API + WebSocket **and the web page** (one URL) | ~210 MB |
| **ml** | [`ml-server/Dockerfile`](../ml-server/Dockerfile) | FastAPI + trained models (`ml/models/`) + Whisper | ~2 GB (TensorFlow) |

The browser only ever talks to **app**. It serves the page and the API from the same address, so there is no CORS to set up.

> **The camera and microphone only work on `https://` or `localhost`.** Every host below gives HTTPS automatically.

---

## 1. Anywhere with Docker (one command)

```bash
docker compose up --build          # first build ~5-10 min; then open http://localhost:5050
```

| Variant | Command |
|---|---|
| Faster, smaller speech model | `WHISPER_MODEL=base docker compose up --build` |
| History in MongoDB | `MONGO_URL=mongodb://mongo:27017/signbridge docker compose --profile mongo up --build` |
| Stop | `docker compose down` (history and the Whisper download are kept in volumes) |

After retraining (`ml/models/` changed), run `docker compose up --build` again. Only the ml image rebuilds.

To show it on a phone or another laptop on the same Wi-Fi, the page must be served over HTTPS, so use a tunnel:

```bash
npx localtunnel --port 5050          # or: cloudflared tunnel --url http://localhost:5050
```

---

## 2. Free cloud hosting (for the demo and the viva)

The ML server needs about 1.5–2 GB of RAM (TensorFlow + Whisper `small`). Most free web tiers only give 512 MB, so split it:

| Part | Where | Why |
|---|---|---|
| **ml** | Hugging Face **Spaces** (Docker, free CPU tier) | Free tier has plenty of RAM for TF + Whisper |
| **app** | **Render** free web service (Docker) | Small image, WebSocket support, HTTPS |
| history *(optional)* | MongoDB **Atlas** free cluster | Set `MONGO_URL`; without it history is kept in a file that resets on redeploy |

Free tiers sleep when idle. The first visit after a break takes up to a minute while both wake up. **Open the app 2 minutes before a demo.**

### 2a. ML server on Hugging Face Spaces

1. huggingface.co → *New Space* → SDK **Docker** → *Blank* → hardware **CPU basic (free)**.
2. Push this repo's files to the Space. The Space needs `ml-server/`, `ml/models/` and a `Dockerfile` at its root:
   ```bash
   git clone https://huggingface.co/spaces/<team>/signbridge-ml hf-space
   cp -r ml-server ml hf-space/ && rm -rf hf-space/ml/data
   cp ml-server/Dockerfile hf-space/Dockerfile
   ```
   Add this block at the top of `hf-space/README.md`. It tells Spaces which port the server listens on:
   ```yaml
   ---
   title: SignBridge ML
   sdk: docker
   app_port: 8000
   ---
   ```
   Then `git add . && git commit -m "deploy" && git push`.
3. When the build finishes, `https://<team>-signbridge-ml.hf.space/health` should list the signs.

### 2b. Web app on Render

1. render.com → *New* → **Web Service** → connect the GitHub repo.
2. Settings:
   - Runtime **Docker**
   - Dockerfile path `backend/Dockerfile`
   - Docker build context `.`
   - Instance type **Free**
3. Environment variables:
   - `ML_URL` = `https://<team>-signbridge-ml.hf.space`
   - `ML_TIMEOUT_MS` = `20000`, because a sleeping Space is slow on its first call
   - `MONGO_URL` = the Atlas connection string (optional)
4. Deploy, then open `https://<service>.onrender.com`. The status dots should go green once the Space has woken up.

### 2c. Frontend on a separate static host *(optional)*

Normally you don't need this, because the app container already serves the page. If you do put `frontend/` on Netlify, Vercel or GitHub Pages, tell it where the backend is. Add this line to `index.html` before the other scripts:

```html
<script>window.SIGNBRIDGE_API = "https://<service>.onrender.com/api";</script>
```

---

## 3. Checklist before a demo

- [ ] `/api/health` → `"ml":"ok"` and the right number of `signs`
- [ ] The camera permission prompt appears, which only happens over HTTPS
- [ ] Words, Letters and Trends modes each recognise one sign
- [ ] The mic → Whisper works. If the free tier is too slow, set `WHISPER_MODEL=base` on the Space
- [ ] *Tuning & debug* shows `socket: ws ✓`

## How the page finds the API

[`frontend/js/config.js`](../frontend/js/config.js) checks these in order:
1. `window.SIGNBRIDGE_API`, if it is set
2. if the page runs on port **8080** or from `file://` (local dev), `http://localhost:5050/api`
3. otherwise, the page's own address + `/api`, as when the app container serves it

The WebSocket URL is derived from that, by changing `http` to `ws` and `/api` to `/ws`.
