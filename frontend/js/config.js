const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// Local dev (python -m http.server 8080 / file://) talks to the backend on :5050. Anywhere else the page is
// served by the backend itself, so the API is on the same origin. window.SIGNBRIDGE_API overrides both
// (e.g. frontend on a static host, backend elsewhere).
const devServer = location.protocol === "file:" || location.port === "8080";
const api = window.SIGNBRIDGE_API || (devServer ? "http://localhost:5050/api" : `${location.origin}/api`);

export const config = {
  api,
  ws: window.SIGNBRIDGE_WS || api.replace(/^http/, "ws").replace(/\/api\/?$/, "/ws"),
  healthEveryMs: 5000,
  minConfidence: 0.7,
  frame: { width: 640, height: 480 },
  mediapipe: {
    bundle: `${MP}/vision_bundle.mjs`,
    wasm: `${MP}/wasm`,
    handModel: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    faceModel: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
  },
  letters: { window: 8, need: 5, holdMs: 1200, everyMs: 100 },   // classify at most ~10 frames/s
  trends: { window: 8, need: 5, holdMs: 600 },
  speech: { maxMs: 15000 },               // auto-stop a recording after 15 s
  player: { signFrameMs: 45, letterMs: 700, unknownMs: 1200 },
};
