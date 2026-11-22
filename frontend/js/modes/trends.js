import { api } from "../api.js";
import { config } from "../config.js";
import { Segmenter, Stabilizer } from "../recognizer.js";
import { TrendRules } from "../trends/rules.js";
import { TRENDS, trendText } from "../trends/catalog.js";
import { $, badge, big, meta, refreshHistory, sentence, top3 } from "../ui.js";

/**
 * Social-media gestures (hybrid):
 *   - rules (trends/rules.js) run on every frame - work with no training data
 *   - if the ml-server has a trained trends model, motion clips are also sent to it,
 *     and a confident model answer wins over the rules
 */
const ASPECT = config.frame.width / config.frame.height;
// Motion gestures (catalog `motion: true`) are already verified over many frames by the rules, so they
// skip the stabilizer's hold time and fire at once (then stay quiet until the motion stops for a moment).
const isMotion = id => !!TRENDS[id]?.motion;
const MOTION_GAP_MS = 800;

export function trendsMode(state, cam) {
  const rules = new TrendRules(), stab = new Stabilizer(config.trends), seg = new Segmenter();
  const motion = { id: null, last: 0 };     // currently-running motion gesture, last time it was seen
  const toPts = lm => lm.map(p => [p.x * ASPECT, p.y, p.z * ASPECT]);   // isotropic units for geometry

  function accept(id, source, confidence = 1) {
    big(trendText(id));
    $("src").textContent = source;
    sentence.add(TRENDS[id]?.emoji ?? id);
    api.log("trends", id, confidence).then(() => refreshHistory(trendText)).catch(() => {});
  }

  async function askModel(sequence) {
    try {
      const d = await api.predictTrend(sequence, state.minConf);
      top3(d.top3, trendText);
      if (d.accepted) { stab.reset(); accept(d.label, "model", d.confidence); }
    } catch (e) { if (e.status === 404) state.trendsModel = false; }
  }

  return {
    id: "trends", label: "Trends",
    async enter() {
      stab.reset(); rules.reset(); seg.reset(); motion.id = null; big("—");
      $("guide").hidden = false;
      badge("", "loading face detector…");
      try { await cam.enableFace(); } catch (e) { meta("face detector unavailable: " + e.message); }
    },
    exit() { $("guide").hidden = true; cam.disableFace(); },
    onFrame({ hands, face, kp }) {
      const pts = (hands.landmarks || []).map(toPts);
      const box = face && { x: face.x * ASPECT, y: face.y, w: face.w * ASPECT, h: face.h };
      const id = rules.detect(pts, box), now = performance.now();
      if (isMotion(id)) {
        if (motion.id !== id || now - motion.last > MOTION_GAP_MS) { stab.reset(); accept(id, "rule (motion)"); }
        motion.id = id; motion.last = now;
      }
      const { stable, emit } = stab.push(isMotion(id) ? null : id);
      if (emit) accept(emit, "rule");
      else if (!stable) big(pts.length ? "…" : "—", true);
      meta(`rule: ${id ?? "none"} · face ${face ? "✓" : "✗"} · model ${state.trendsModel ? "on" : "off"}`);
      badge(pts.length ? "capturing" : "", pts.length ? "trends mode" : "show a gesture");
      if (state.trendsModel) { const out = seg.push(kp); if (out?.sequence) askModel(out.sequence); }
    },
  };
}

export function renderGuide() {
  $("guideList").replaceChildren(...Object.values(TRENDS).map(t => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="emoji"></span><b></b><small></small>`;
    li.children[0].textContent = t.emoji; li.children[1].textContent = t.name; li.children[2].textContent = t.how;
    return li;
  }));
}
