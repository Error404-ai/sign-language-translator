import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { keypoints, Segmenter, hasHands } from "./recognizer.js";

const API = window.SIGNBRIDGE_API || "http://localhost:5000/api";
const $ = id => document.getElementById(id);
const S = { sentence: [], minConf: 0.7, swap: true, tokens: [] };
const seg = new Segmenter();

// ---------- tabs ----------
document.querySelectorAll("nav button").forEach(b => b.onclick = () => {
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.id === b.dataset.tab));
});

// ---------- backend health ----------
async function health() {
  try {
    const d = await (await fetch(`${API}/health`)).json();
    $("dotBack").className = "dot ok";
    $("dotMl").className = "dot " + (d.ml === "ok" ? "ok" : "");
  } catch { $("dotBack").className = "dot"; $("dotMl").className = "dot"; }
}
health(); setInterval(health, 5000);

// ---------- UI helpers ----------
function badge(state, text) { const b = $("badge"); b.className = "badge " + state; b.textContent = text; }
function renderSentence() { $("sentence").textContent = S.sentence.join(" ") || "\u00a0"; }
function showResult(d) {
  const big = $("big");
  big.textContent = d.accepted ? d.label.replaceAll("_", " ") : "not sure";
  big.className = d.accepted ? "" : "unsure";
  $("top3").replaceChildren(...d.top3.map(t => {
    const row = document.createElement("div"); row.className = "bar";
    const name = document.createElement("span"); name.textContent = t.label.replaceAll("_", " ");
    const track = document.createElement("div"), fill = document.createElement("i");
    fill.style.width = (t.confidence * 100).toFixed(0) + "%"; track.append(fill);
    const pct = document.createElement("span"); pct.textContent = (t.confidence * 100).toFixed(0) + "%";
    row.append(name, track, pct); return row;
  }));
  $("meta").textContent = `latency ${d.latencyMs} ms`;
}
async function loadHistory() {
  try {
    const rows = await (await fetch(`${API}/history?limit=6`)).json();
    $("hist").replaceChildren(...rows.map(r => {
      const li = document.createElement("li"), b = document.createElement("b");
      b.textContent = r.label.replaceAll("_", " ");
      li.append(b, ` ${(r.confidence * 100).toFixed(0)}%`); return li;
    }));
  } catch {}
}
loadHistory();

// ---------- controls ----------
$("conf").oninput = e => { S.minConf = +e.target.value; $("confV").textContent = S.minConf.toFixed(2); };
$("still").oninput = e => { seg.o.still = +e.target.value; $("stillV").textContent = (+e.target.value).toFixed(3); };
$("swap").onchange = e => { S.swap = e.target.checked; };
$("speak").onclick = () => { if (S.sentence.length) speechSynthesis.speak(new SpeechSynthesisUtterance(S.sentence.join(" ").replaceAll("_", " "))); };
$("undo").onclick = () => { S.sentence.pop(); renderSentence(); };
$("clear").onclick = () => { S.sentence = []; renderSentence(); };

// ---------- classify one captured clip ----------
async function classify(sequence) {
  badge("predicting", "recognising…");
  try {
    const r = await fetch(`${API}/predict`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence, minConfidence: S.minConf }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.status);
    showResult(d);
    if (d.accepted) { S.sentence.push(d.label.replaceAll("_", " ")); renderSentence(); loadHistory(); }
  } catch (e) { $("meta").textContent = "error: " + e.message; }
}

// ---------- letters mode (calls the ML server directly) ----------
const API_ML = "http://localhost:8000";
let mode = "words", letterBusy = false, recent = [];
let held = { label: null, since: 0, done: false };
$("modeBtn").onclick = e => {
  mode = mode === "words" ? "letters" : "words";
  e.target.textContent = "Mode: " + (mode === "words" ? "Words" : "Letters");
  seg.reset(); recent = []; $("big").textContent = "—";
};

async function classifyLetter(kp) {
  letterBusy = true;
  try {
    const r = await fetch(`${API_ML}/predict-letter`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keypoints: kp }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || r.status);
    recent.push(d.confidence > S.minConf ? d.label : null);
    if (recent.length > 8) recent.shift();
    const counts = {};
    recent.forEach(l => { if (l) counts[l] = (counts[l] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const stable = top && top[1] >= 5;
    $("big").textContent = stable ? top[0] : "...";
    $("big").className = stable ? "" : "unsure";
    if (stable) {
      if (held.label !== top[0]) held = { label: top[0], since: performance.now(), done: false };
      else if (!held.done && performance.now() - held.since > 1200) {
        S.sentence.push(top[0]); renderSentence(); held.done = true;
      }
    } else held = { label: null, since: 0, done: false };
    $("meta").textContent = `${d.label} ${(d.confidence * 100).toFixed(0)}%`;
  } catch (e) { $("meta").textContent = "error: " + e.message; }
  letterBusy = false;
}

// ---------- camera + MediaPipe ----------
const video = document.createElement("video"); video.playsInline = true; video.muted = true;
const canvas = $("cam"), ctx = canvas.getContext("2d");
const off = document.createElement("canvas"); off.width = 640; off.height = 480;   // mirrored copy = selfie view, like training
const octx = off.getContext("2d");
let landmarker, lastLm = [], lastT = -1;

function draw() {
  ctx.save(); ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height); ctx.restore();
  ctx.fillStyle = "#f87171";
  lastLm.forEach(h => h.forEach(p => { ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 7); ctx.fill(); }));
  requestAnimationFrame(draw);
}

function detect() {
  if (video.readyState >= 2 && video.currentTime !== lastT) {
    lastT = video.currentTime;
    octx.save(); octx.translate(640, 0); octx.scale(-1, 1); octx.drawImage(video, 0, 0, 640, 480); octx.restore();
    try {
      const res = landmarker.detectForVideo(off, performance.now());
      lastLm = res.landmarks || [];
      const kp = keypoints(res, S.swap);
      if (mode === "letters") {
        if (hasHands(kp)) { badge("capturing", "letters mode"); if (!letterBusy) classifyLetter(kp); }
        else { recent = []; held = { label: null, since: 0, done: false }; $("big").textContent = "—"; badge("", "show a letter"); }
      } else {
        const out = seg.push(kp);
        $("mot").textContent = seg.motion.toFixed(3); $("fr").textContent = seg.frames.length;
        if (out?.sequence) classify(out.sequence);
        else if (out?.discarded) badge("", "too short / no movement — try again");
        else if (seg.state === "capturing") badge("capturing", `signing… ${seg.frames.length}`);
        else badge("", lastLm.length ? "hands seen — start signing" : "raise your hands to sign");
      }
    } catch (e) { badge("", "hands error: " + e); }
  }
  requestAnimationFrame(detect);
}

async function start() {
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    await video.play(); draw();
    const files = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    landmarker = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
      runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    badge("", "ready"); detect();
  } catch (e) { badge("", "start error: " + e.message); }
}
start();

// ---------- text / speech -> sign ----------
async function translate() {
  const text = $("txt").value.trim(); if (!text) return;
  try {
    const r = await fetch(`${API}/text-to-sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    S.tokens = (await r.json()).tokens || [];
    $("chips").replaceChildren(...S.tokens.map(t => {
      const c = document.createElement("span");
      c.className = "chip " + (t.type === "sign" ? "sign" : "fs");
      c.textContent = t.type === "sign" ? t.text : t.letters.join("-").toUpperCase();
      return c;
    }));
  } catch (e) { $("chips").textContent = "error: " + e.message; }
}
$("go").onclick = translate;

// ---------- hand player (draws the recorded keypoints from poses.json) ----------
let POSES = { letters: {}, signs: {} };
fetch("poses.json").then(r => r.json()).then(j => { POSES = j; }).catch(() => {});
const CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
              [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const hc = $("hand"), hctx = hc.getContext("2d");
const wait = ms => new Promise(r => setTimeout(r, ms));

function drawPose(frame) {
  hctx.clearRect(0, 0, hc.width, hc.height);
  if (!frame) return;
  const hands = [];
  for (const slot of [0, 1]) {
    const b = slot * 65;
    if (!frame.slice(b, b + 65).some(x => x !== 0)) continue;
    const wx = frame[b + 63], wy = frame[b + 64], pts = [];
    for (let i = 0; i < 21; i++) {
      pts.push([(wx + frame[b + i * 3] * 0.15) * 640, (wy + frame[b + i * 3 + 1] * 0.15) * 480]);
    }
    hands.push(pts);
  }
  if (!hands.length) return;
  const all = hands.flat(), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.min(hc.width * 0.8 / (maxX - minX || 1), hc.height * 0.8 / (maxY - minY || 1));
  const ox = (hc.width - (maxX - minX) * k) / 2 - minX * k;
  const oy = (hc.height - (maxY - minY) * k) / 2 - minY * k;
  hands.forEach((pts, h) => {
    const P = pts.map(p => [p[0] * k + ox, p[1] * k + oy]);
    hctx.strokeStyle = h === 0 ? "#60a5fa" : "#4ade80"; hctx.lineWidth = 4; hctx.lineCap = "round";
    CONN.forEach(([a, c]) => { hctx.beginPath(); hctx.moveTo(...P[a]); hctx.lineTo(...P[c]); hctx.stroke(); });
    hctx.fillStyle = "#fff";
    P.forEach(p => { hctx.beginPath(); hctx.arc(p[0], p[1], 5, 0, 7); hctx.fill(); });
  });
}

$("play").onclick = async () => {
  const chips = [...$("chips").children];
  for (let i = 0; i < S.tokens.length; i++) {
    const t = S.tokens[i];
    chips.forEach((c, j) => c.classList.toggle("now", j === i));
    if (t.type === "sign") {
      $("stage").textContent = t.text;
      const seq = POSES.signs[t.label];
      if (seq) { for (const f of seq) { drawPose(f); await wait(45); } await wait(300); }
      else { drawPose(null); await wait(1200); }
    } else {
      for (const L of t.letters) {
        $("stage").textContent = L.toUpperCase();
        drawPose(POSES.letters[L.toUpperCase()]);
        await wait(700);
      }
    }
  }
  chips.forEach(c => c.classList.remove("now")); $("stage").textContent = "—"; drawPose(null);
};

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) { $("mic").disabled = true; $("micInfo").textContent = " mic input needs Chrome/Edge"; }
else $("mic").onclick = () => {
  const rec = new SR(); rec.lang = "en-IN";
  rec.onresult = e => { $("txt").value = e.results[0][0].transcript; translate(); };
  rec.onend = () => $("micInfo").textContent = ""; rec.onerror = e => $("micInfo").textContent = " " + e.error;
  $("micInfo").textContent = " listening…"; rec.start();
};