import { config } from "./config.js";
import { hasHands } from "./recognizer.js";

// MediaPipe hand skeleton edges
export const CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
                     [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
export const HAND_COLORS = ["#60a5fa", "#4ade80"];            // slot 0 = left, slot 1 = right
const REST_POSE = "B";                                         // flat hand shown while idle
const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * 130 normalised floats -> [{ slot, pts: 21 x [x, y, z] }] in camera pixels (640 x 480).
 * Undoes the training normalisation using a typical hand size of 15 % of the frame height.
 */
export function frameToHands(frame) {
  if (!frame) return [];
  const { width: W, height: H } = config.frame, k = 0.15;
  const hands = [];
  for (const slot of [0, 1]) {
    const b = slot * 65;
    if (!hasHands(frame.slice(b, b + 65))) continue;
    const wx = frame[b + 63], wy = frame[b + 64];
    hands.push({ slot, pts: Array.from({ length: 21 }, (_, i) =>
      [(wx + frame[b + i * 3] * k) * W, (wy + frame[b + i * 3 + 1] * k) * H, frame[b + i * 3 + 2] * k * W]) });
  }
  return hands;
}

/** Flat 2D skeleton on a canvas, auto-fitted. Used when WebGL / Three.js isn't available. */
export class Skeleton2D {
  constructor(canvas) { this.c = canvas; this.ctx = canvas.getContext("2d"); }
  show(on) { this.c.hidden = !on; }
  draw(frame) {
    const { c, ctx } = this;
    ctx.clearRect(0, 0, c.width, c.height);
    const hands = frameToHands(frame);
    if (!hands.length) return;
    const all = hands.flatMap(h => h.pts), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.min(c.width * 0.8 / (maxX - minX || 1), c.height * 0.8 / (maxY - minY || 1));
    const ox = (c.width - (maxX - minX) * k) / 2 - minX * k, oy = (c.height - (maxY - minY) * k) / 2 - minY * k;
    for (const { slot, pts } of hands) {
      const P = pts.map(p => [p[0] * k + ox, p[1] * k + oy]);
      ctx.strokeStyle = HAND_COLORS[slot]; ctx.lineWidth = 4; ctx.lineCap = "round";
      CONN.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(...P[a]); ctx.lineTo(...P[b]); ctx.stroke(); });
      ctx.fillStyle = "#fff";
      P.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 7); ctx.fill(); });
    }
  }
}

/** Plays gloss tokens (signs = recorded clips, letters = single poses) on a 2D or 3D view. */
export class HandPlayer {
  constructor(view) {
    this.view = view;
    this.poses = { letters: {}, signs: {} };
    this.ready = fetch("assets/poses.json").then(r => r.json()).then(j => { this.poses = j; this.rest(); }).catch(() => {});
  }
  setView(view) { this.view = view; this.rest(); }
  rest() { this.view.draw(this.poses.letters[REST_POSE] ?? null); }

  /** tokens from /api/text-to-sign; onStep(i, caption) highlights progress */
  async play(tokens, onStep) {
    if (this.playing) return;
    this.playing = true;
    const { signFrameMs, letterMs, unknownMs } = config.player;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === "sign") {
        onStep(i, t.text);
        const seq = this.poses.signs[t.label];
        if (seq) { for (const f of seq) { this.view.draw(f); await wait(signFrameMs); } await wait(300); }
        else { this.view.draw(null); await wait(unknownMs); }
      } else {
        for (const L of t.letters) { onStep(i, L.toUpperCase()); this.view.draw(this.poses.letters[L.toUpperCase()]); await wait(letterMs); }
      }
    }
    onStep(-1, "—"); this.rest();
    this.playing = false;
  }
}
