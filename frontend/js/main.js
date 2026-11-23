import { api, socket } from "./api.js";
import { config } from "./config.js";
import { keypoints, hasHands } from "./recognizer.js";
import { $, badge, refreshHistory, sentence, top3 } from "./ui.js";
import { speak } from "./speech.js";
import { setupTextToSign } from "./text-to-sign.js";
import { wordsMode } from "./modes/words.js";
import { lettersMode } from "./modes/letters.js";
import { trendsMode, renderGuide } from "./modes/trends.js";

const state = { minConf: config.minConfidence, swap: true, trendsModel: false };

// ---------- tabs ----------
// Text -> Sign (2.8 MB of poses, Three.js, a WebGL context) is set up the first time its tab opens,
// so it doesn't compete with MediaPipe for bandwidth while the camera starts.
let textToSignReady = false;
document.querySelectorAll("nav button").forEach(b => b.onclick = () => {
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.id === b.dataset.tab));
  if (b.dataset.tab === "textTab" && !textToSignReady) { textToSignReady = true; setupTextToSign(); }
});

// ---------- backend / model status ----------
async function health() {
  try {
    const d = await api.health();
    $("dotBack").className = "dot ok";
    $("dotMl").className = "dot " + (d.ml === "ok" ? "ok" : "");
    state.trendsModel = !!d.trendsModel;
  } catch { $("dotBack").className = "dot"; $("dotMl").className = "dot"; }
}
health(); setInterval(health, config.healthEveryMs);
socket.onstatus = up => { $("sock").textContent = up ? "ws ✓" : "http (ws reconnecting)"; };
refreshHistory();

// ---------- controls ----------
$("conf").oninput = e => { state.minConf = +e.target.value; $("confV").textContent = state.minConf.toFixed(2); };
$("swap").onchange = e => { state.swap = e.target.checked; };
$("speak").onclick = () => speak(sentence.text());
$("undo").onclick = () => sentence.undo();
$("clear").onclick = () => sentence.clear();


// ---------- recognition modes ----------
const words = wordsMode(state);
let mode = words;
$("still").oninput = e => { words.seg.o.still = +e.target.value; $("stillV").textContent = (+e.target.value).toFixed(3); };
renderGuide();

try {
  const { Camera } = await import("./camera.js");   // pulls MediaPipe from the CDN
  const cam = new Camera($("cam"));
  const modes = [words, lettersMode(state), trendsMode(state, cam)];

  $("modes").replaceChildren(...modes.map(m => {
    const b = document.createElement("button");
    b.textContent = m.label; b.className = m === mode ? "on" : "";
    b.onclick = async () => {
      if (m === mode) return;
      mode.exit(); mode = m;
      [...$("modes").children].forEach(x => x.classList.toggle("on", x === b));
      top3([]); $("src").textContent = "—";
      await m.enter();
    };
    return b;
  }));

  await cam.start(({ hands, face, t, detectMs }) => {
    try {
      const kp = keypoints(hands, state.swap);
      mode.onFrame({ hands, face, t, detectMs, kp, handsSeen: hasHands(kp) });
    } catch (e) { badge("", "error: " + e.message); }
  });
  badge("", "ready");
  window.signbridge = { state, cam, modes, get mode() { return mode; } };   // debugging hook (console / tests)
} catch (e) { badge("", "start error: " + e.message); }
