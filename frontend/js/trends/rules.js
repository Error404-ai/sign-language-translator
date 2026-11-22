/**
 * Rule-based recognition of social-media / trend gestures from MediaPipe hand landmarks.
 * Pure logic (no DOM) - unit-tested in frontend/test/rules.test.js.
 *
 * Units: points are [x, y, z] in image space with x already multiplied by the aspect ratio,
 * so distances are isotropic. y grows downward. Face box: { x, y, w, h } (top-left) in the same units.
 * Every threshold is relative to the hand size (wrist -> middle-finger knuckle).
 */
const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_TIP = 8, MIDDLE_MCP = 9, MIDDLE_TIP = 12;
const FINGERS = [ // [pip, tip] for index, middle, ring, pinky
  [6, 8], [10, 12], [14, 16], [18, 20],
];

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0));
export const handSize = h => dist(h[WRIST], h[MIDDLE_MCP]) || 1e-6;

/** [thumb, index, middle, ring, pinky] -> true when extended */
export function fingerStates(h, s = handSize(h)) {
  const thumb = dist(h[THUMB_TIP], h[MIDDLE_MCP]) > 0.8 * s && dist(h[THUMB_TIP], h[INDEX_MCP]) > 0.45 * s;
  return [thumb, ...FINGERS.map(([pip, tip]) => dist(h[WRIST], h[tip]) > dist(h[WRIST], h[pip]) * 1.12)];
}

const is = (st, pattern) => pattern.every((p, i) => p === null || st[i] === p);   // null = don't care
const inBox = (p, x0, x1, y0, y1) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;

/** Distance from point p to segment a-b (x, y only). */
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / ((vx * vx + vy * vy) || 1e-9)));
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
}

/** Thumb tip lies on the index finger's middle/top segment (crossed, as in the Korean finger heart). */
export const thumbOnIndex = (h, s = handSize(h)) =>
  Math.min(segDist(h[THUMB_TIP], h[6], h[7]), segDist(h[THUMB_TIP], h[7], h[INDEX_TIP])) < 0.3 * s;

function angleDeg(a0, a1, b0, b1) {
  const u = [a1[0] - a0[0], a1[1] - a0[1]], v = [b1[0] - b0[0], b1[1] - b0[1]];
  const c = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1e-6);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

/** Single-hand gestures, most specific first. Returns an id from catalog.js or null. */
export function oneHand(h, face = null) {
  const s = handSize(h), st = fingerStates(h, s);
  const pinch = dist(h[THUMB_TIP], h[INDEX_TIP]);
  const thumbCrossed = thumbOnIndex(h, s);
  const indexBend = angleDeg(h[INDEX_MCP], h[6], h[6], h[INDEX_TIP]);   // 0 = dead straight

  // OK: thumb+index tips touch, other three fingers up
  if (pinch < 0.3 * s && is(st, [null, null, true, true, true])) return "ok";
  // Saranghae (finger heart): other three folded, and either the thumb/index tips touch, or the thumb
  // crosses a *bent* index. A straight index with the thumb tucked beside it is Clock it, not this.
  if (is(st, [null, null, false, false, false]) && dist(h[INDEX_MCP], h[INDEX_TIP]) > 0.5 * s &&
      (pinch < 0.35 * s || (thumbCrossed && indexBend > 25))) return "saranghae";

  if (face) {
    const { x, y, w, h: fh } = face;
    const thumbAngle = angleDeg(h[2], h[THUMB_TIP], h[INDEX_MCP], h[INDEX_TIP]);   // thumb vs index direction
    if (is(st, [true, true, false, false, false]) && thumbAngle > 50 &&
        inBox(h[INDEX_MCP], x - 0.2 * w, x + 1.2 * w, y - 0.8 * fh, y + 0.4 * fh)) return "l_forehead";
    // Clock it: a straight index finger pointing near the eyes, thumb tucked
    // (thumb sticking out wide = an "L", which is not Clock it)
    const thumbOut = st[0] && thumbAngle > 40;
    if (is(st, [null, true, false, false, false]) && !thumbOut && indexBend < 35 &&
        inBox(h[INDEX_TIP], x - 0.5 * w, x + 1.5 * w, y - 0.3 * fh, y + 0.6 * fh)) return "clock_it";
  }
  if (is(st, [true, false, false, false, false])) {
    if (thumbCrossed || pinch < 0.45 * s) return null;          // thumb resting on the index -> not a thumbs gesture
    const others = h.filter((_, i) => i !== THUMB_TIP && i !== 3);
    const tipY = h[THUMB_TIP][1];
    if (others.every(p => tipY < p[1]) && tipY < h[WRIST][1] - 0.5 * s) return "thumbs_up";
    if (others.every(p => tipY > p[1]) && tipY > h[WRIST][1] + 0.5 * s) return "thumbs_down";
    return null;
  }
  if (is(st, [true, true, false, false, true])) return "ily";
  if (is(st, [true, false, false, false, true])) return "shaka";
  if (is(st, [false, true, false, false, true])) return "rock_on";
  if (is(st, [null, true, true, false, false]) && dist(h[INDEX_TIP], h[MIDDLE_TIP]) > 0.3 * s) return "peace";
  return null;
}

/**
 * Muscle / bicep heart: one arm flexed, its hand drooping DOWN from above; the other hand below
 * curls its fingers UP to meet those fingertips, thumb pointing down at the bicep.
 * Only hands are tracked (no arms), so the rule is the hand arrangement:
 *   - one hand clearly higher than the other
 *   - upper hand's fingers point down, lower hand's fingers point up
 *   - fingertips of the two hands touch
 *   - thumb tips far apart (that's what separates it from the classic heart hands)
 */
export function muscleHeart(a, b) {
  const s = (handSize(a) + handSize(b)) / 2;
  const [up, lo] = a[WRIST][1] < b[WRIST][1] ? [a, b] : [b, a];
  if (lo[WRIST][1] - up[WRIST][1] < 0.2 * s) return false;               // side by side -> not this
  const pointsDown = h => h[MIDDLE_TIP][1] > h[MIDDLE_MCP][1] + 0.15 * s;
  const pointsUp = h => h[MIDDLE_TIP][1] < h[MIDDLE_MCP][1] - 0.05 * s || h[INDEX_TIP][1] < h[INDEX_MCP][1] - 0.05 * s;
  if (!pointsDown(up) || !pointsUp(lo)) return false;
  const tips = [INDEX_TIP, MIDDLE_TIP];
  const touch = Math.min(...tips.flatMap(i => tips.map(j => dist(up[i], lo[j]))));
  return touch < 0.5 * s && dist(up[THUMB_TIP], lo[THUMB_TIP]) > 0.6 * s;
}

/** Heart made with both hands: index tips touch on top, thumb tips touch below. */
export function heartHands(a, b) {
  const s = (handSize(a) + handSize(b)) / 2;
  return dist(a[INDEX_TIP], b[INDEX_TIP]) < 0.45 * s && dist(a[THUMB_TIP], b[THUMB_TIP]) < 0.45 * s &&
         a[INDEX_TIP][1] < a[THUMB_TIP][1] && b[INDEX_TIP][1] < b[THUMB_TIP][1];
}

function pearson(a, b) {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Stateful detector: static rules every frame + the "6-7" see-saw motion over a short history. */
export class TrendRules {
  constructor(opts = {}) {
    // window/minFrames in frames (~30 fps); minAmp relative to hand size
    this.o = { window: 20, minFrames: 8, maxCorr: -0.2, minAmp: 0.25, minReversals: 1, maxMiss: 6, ...opts };
    this.reset();
  }
  reset() { this.track = []; this.miss = 0; }

  /** hands: array of 21-point landmark arrays; face: box or null. Returns gesture id or null. */
  detect(hands, face = null) {
    if (hands.length >= 2) {
      this.miss = 0;
      const [a, b] = [...hands].sort((p, q) => p[WRIST][0] - q[WRIST][0]);      // keep left/right identity
      if (this.sixSeven(a, b)) return "six_seven";
      if (heartHands(a, b)) return "heart_hands";
      if (muscleHeart(a, b)) return "muscle_heart";
    } else if (++this.miss > this.o.maxMiss) this.track = [];   // tolerate brief tracking drop-outs
    for (const h of hands) { const g = oneHand(h, face); if (g) return g; }
    return null;
  }

  /** Hands alternating up/down (anti-correlated vertical motion). Finger shape is ignored on purpose:
   *  with palms facing up the fingers are foreshortened and often look curled to MediaPipe. */
  sixSeven(a, b) {
    const s0 = (handSize(a) + handSize(b)) / 2;
    if (Math.abs(a[WRIST][0] - b[WRIST][0]) < 1.2 * s0) { this.track = []; return false; }   // hands together = not 6-7
    this.track.push({ a: a[WRIST][1], b: b[WRIST][1], s: s0 });
    if (this.track.length > this.o.window) this.track.shift();
    if (this.track.length < this.o.minFrames) return false;
    const s = this.track.reduce((x, t) => x + t.s, 0) / this.track.length;
    const ya = this.track.map(t => t.a), yb = this.track.map(t => t.b);
    const amp = y => (Math.max(...y) - Math.min(...y)) / s;
    if (amp(ya) < this.o.minAmp || amp(yb) < this.o.minAmp) return false;
    const da = ya.slice(1).map((y, i) => y - ya[i]), db = yb.slice(1).map((y, i) => y - yb[i]);
    if (pearson(da, db) > this.o.maxCorr) return false;
    const reversals = d => {
      let n = 0, sign = 0;
      for (const v of d) {
        if (Math.abs(v) < 0.015 * s) continue;
        const sg = Math.sign(v);
        if (sign && sg !== sign) n++;
        sign = sg;
      }
      return n;
    };
    return Math.max(reversals(da), reversals(db)) >= this.o.minReversals;
  }
}
