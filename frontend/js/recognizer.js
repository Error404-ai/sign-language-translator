// Pure logic (no DOM) - unit-tested in frontend/test. Keypoint math mirrors ml/signbridge/keypoints.py exactly.

export function normHand(pts) {
  const w = pts[0];
  const rel = pts.map(p => [p[0] - w[0], p[1] - w[1], p[2] - w[2]]);
  const s = Math.hypot(...rel[9]) || 1;
  return [...rel.flat().map(v => v / s), w[0], w[1]];          // 63 + 2 = 65
}

// MediaPipe result -> 130 floats (slot 0 = Left, slot 1 = Right)
export function keypoints(res, swap = false) {
  const out = new Array(130).fill(0);
  const hs = res.landmarks || [], inf = res.handedness || [];
  const used = [false, false];
  hs.forEach((h, i) => {
    let slot = inf[i]?.[0]?.categoryName === "Left" ? 0 : 1;
    if (swap) slot = 1 - slot;
    if (used[slot]) slot = 1 - slot;                            // both hands got the same label
    used[slot] = true;
    normHand(h.map(p => [p.x, p.y, p.z])).forEach((x, j) => out[slot * 65 + j] = x);
  });
  return out;
}

export const hasHands = f => f.some(x => x !== 0);

// How much changed between two frames (0 if either has no hands)
export function motion(a, b) {
  let shape = 0, n = 0, move = 0, hands = 0;
  for (const s of [0, 1]) {
    const o = s * 65;
    let pa = false, pb = false;
    for (let j = 0; j < 65; j++) { if (a[o + j] !== 0) pa = true; if (b[o + j] !== 0) pb = true; }
    if (!pa || !pb) continue;
    for (let j = 0; j < 63; j++) { shape += Math.abs(b[o + j] - a[o + j]); n++; }
    move += Math.abs(b[o + 63] - a[o + 63]) + Math.abs(b[o + 64] - a[o + 64]);
    hands++;
  }
  return n ? shape / n + 2 * (move / hands) : 0;
}

/**
 * Cuts the live frame stream into one clip per sign, like the training videos.
 *   waiting -> (hands visible) -> capturing -> (hands gone / held still / too long) -> emit
 * push(kp) returns null, {sequence: 30x130}, or {discarded: true}
 */
export class Segmenter {
  constructor(opts = {}) {
    this.o = { startFrames: 3, endAbsent: 8, endStill: 18, maxFrames: 150,
               minActive: 6, still: 0.02, ...opts };
    this.reset();
  }
  reset() {
    this.state = "waiting"; this.frames = []; this.pre = []; this.prev = null;
    this.run = 0; this.quiet = 0; this.absent = 0; this.active = 0;
    this.motion = 0; this.needMotion = false;
  }
  push(kp) {
    const o = this.o, present = hasHands(kp);
    const m = this.prev ? motion(this.prev, kp) : 0;
    this.prev = kp; this.motion = m;

    if (this.state === "waiting") {
      if (!present) { this.needMotion = false; this.run = 0; this.pre = []; return null; }
      if (this.needMotion && m <= o.still) { this.run = 0; this.pre = []; return null; }
      this.pre.push(kp);
      if (++this.run >= o.startFrames) {
        this.state = "capturing"; this.frames = this.pre; this.pre = [];
        this.quiet = 0; this.absent = 0; this.active = 0;
      }
      return null;
    }

    // capturing
    this.frames.push(kp);
    this.absent = present ? 0 : this.absent + 1;
    if (present && m > o.still) { this.active++; this.quiet = 0; } else this.quiet++;

    const byAbsent = this.absent >= o.endAbsent;
    const byStill = this.quiet >= o.endStill;
    if (!(byAbsent || byStill || this.frames.length >= o.maxFrames)) return null;

    const keep = Math.min(this.quiet, 3);
    const clip = this.frames.slice(0, this.frames.length - this.quiet + keep);
    const active = this.active;
    this.state = "waiting"; this.frames = []; this.run = 0; this.needMotion = byStill;
    if (active < o.minActive || clip.length < 8) return { discarded: true };
    return { sequence: resample(clip) };
  }
}

/**
 * Turns a noisy per-frame label stream into stable outputs.
 *   push(label|null) -> { stable, emit }
 *   stable: label seen in >= `need` of the last `window` frames (else null)
 *   emit:   that label, once, after it stayed stable for `holdMs`
 */
export class Stabilizer {
  constructor(opts = {}) {
    this.o = { window: 8, need: 5, holdMs: 1200, ...opts };
    this.reset();
  }
  reset() { this.recent = []; this.held = { label: null, since: 0, done: false }; }
  push(label, now = performance.now()) {
    this.recent.push(label ?? null);
    if (this.recent.length > this.o.window) this.recent.shift();
    const counts = new Map();
    for (const l of this.recent) if (l) counts.set(l, (counts.get(l) || 0) + 1);
    let top = null, n = 0;
    for (const [l, c] of counts) if (c > n) { top = l; n = c; }
    const stable = n >= this.o.need ? top : null;
    let emit = null;
    if (!stable) this.held = { label: null, since: 0, done: false };
    else if (this.held.label !== stable) this.held = { label: stable, since: now, done: false };
    else if (!this.held.done && now - this.held.since >= this.o.holdMs) { this.held.done = true; emit = stable; }
    return { stable, emit };
  }
}

// Even resample of a clip to `n` frames (same as np.linspace indexing in Python)
export const resample = (clip, n = 30) =>
  Array.from({ length: n }, (_, i) => clip[Math.round(i * (clip.length - 1) / (n - 1))]);
