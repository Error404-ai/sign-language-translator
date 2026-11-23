import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerStates, muscleHeart, oneHand, TrendRules } from "../js/trends/rules.js";
import { makeHand, RIGHT } from "./hands.js";

const S = 0.1;   // hand size ~0.1 of the frame
const hand = (ext, o = {}) => makeHand(ext, { at: [0.6, 0.6], scale: S, ...o });

test("finger states", () => {
  assert.deepEqual(fingerStates(hand({ index: 1, pinky: 1 })), [false, true, false, false, true]);
  assert.deepEqual(fingerStates(hand({ thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 })), [true, true, true, true, true]);
});

test("static one-hand gestures", () => {
  assert.equal(oneHand(hand({ index: 1, middle: 1 })), "peace");
  assert.equal(oneHand(hand({ index: 1, pinky: 1 })), "rock_on");
  assert.equal(oneHand(hand({ thumb: 1, index: 1, pinky: 1 })), "ily");
  assert.equal(oneHand(hand({ thumb: 1, pinky: 1 })), "shaka");
  assert.equal(oneHand(hand({})), null);
});

test("thumbs up / down depend on orientation", () => {
  assert.equal(oneHand(hand({ thumb: 1 }, { rotate: -RIGHT })), "thumbs_up");
  assert.equal(oneHand(hand({ thumb: 1 }, { rotate: RIGHT })), "thumbs_down");
  assert.equal(oneHand(hand({ thumb: 1 })), null);   // upright: thumb is not the highest point
});

test("ok vs saranghae (tips touching)", () => {
  const ok = hand({ thumb: 1, middle: 1, ring: 1, pinky: 1 });
  ok[8] = [ok[4][0] - 0.01, ok[4][1], 0];
  assert.equal(oneHand(ok), "ok");
  const fh = hand({ thumb: 1 });
  fh[8] = [fh[4][0] - 0.01, fh[4][1] + 0.01, 0];
  assert.equal(oneHand(fh), "saranghae");
});

// Real Korean finger heart: index bent ~60 deg at the middle knuckle toward the thumb,
// thumb crossed over its middle segment, tips NOT touching.
const saranghae = (o = {}) => {
  const h = makeHand({ thumb: 1, index: 1 }, { at: [0.6, 0.6], scale: S, ...o });
  const u = [h[6][0] - h[5][0], h[6][1] - h[5][1]], L = Math.hypot(...u) / 0.4;     // L = one hand-size unit
  const a = Math.PI / 3, b = [(u[0] * Math.cos(a) - u[1] * Math.sin(a)) / Math.hypot(...u), (u[0] * Math.sin(a) + u[1] * Math.cos(a)) / Math.hypot(...u)];
  h[7] = [h[6][0] + b[0] * 0.25 * L, h[6][1] + b[1] * 0.25 * L, 0];
  h[8] = [h[6][0] + b[0] * 0.45 * L, h[6][1] + b[1] * 0.45 * L, 0];
  const mid = [(h[6][0] + h[7][0]) / 2, (h[6][1] + h[7][1]) / 2];
  h[3] = [mid[0] + 0.03, mid[1] + 0.02, 0];
  h[4] = [mid[0] + 0.005, mid[1], 0];
  return h;
};

test("crossed-thumb saranghae is not thumbs up", () => {
  assert.equal(oneHand(saranghae()), "saranghae");
  assert.equal(oneHand(saranghae({ rotate: -0.3 })), "saranghae");
  assert.equal(oneHand(hand({ thumb: 1 }, { rotate: -RIGHT })), "thumbs_up");   // plain thumbs up unaffected
});

test("saranghae near the face is not clock it", () => {
  const face = { x: 0.5, y: 0.3, w: 0.25, h: 0.3 };
  assert.equal(oneHand(saranghae({ at: [0.6, 0.55] }), face), "saranghae");
  assert.equal(oneHand(makeHand({ index: 1 }, { at: [0.6, 0.55], scale: S }), face), "clock_it");
});

test("clock it with the thumb tucked against the index is still clock it", () => {
  const face = { x: 0.5, y: 0.3, w: 0.25, h: 0.3 };
  const h = makeHand({ index: 1 }, { at: [0.6, 0.55], scale: S });
  h[4] = [h[6][0] + 0.004, h[6][1] + 0.006, 0];            // thumb tip resting at the index's middle knuckle
  h[3] = [h[6][0] + 0.03, h[6][1] + 0.03, 0];
  assert.equal(oneHand(h, face), "clock_it");
  assert.notEqual(oneHand(h, null), "saranghae");
});

test("wide thumb + index (L shape) at eye level is not clock it", () => {
  const face = { x: 0.5, y: 0.3, w: 0.25, h: 0.3 };
  assert.notEqual(oneHand(makeHand({ thumb: 1, index: 1 }, { at: [0.6, 0.55], scale: S }), face), "clock_it");
});

test("face-relative gestures need a face", () => {
  const face = { x: 0.5, y: 0.3, w: 0.25, h: 0.3 };
  const point = makeHand({ index: 1 }, { at: [0.6, 0.55], scale: S });     // index tip lands near eye level
  assert.equal(oneHand(point, face), "clock_it");
  assert.equal(oneHand(point, null), null);
  const L = makeHand({ thumb: 1, index: 1 }, { at: [0.55, 0.4], scale: S });
  assert.equal(oneHand(L, face), "l_forehead");
});

test("heart hands", () => {
  const r = new TrendRules();
  const a = hand({}), b = hand({});
  a[8] = [0.50, 0.40, 0]; b[8] = [0.51, 0.40, 0];
  a[4] = [0.50, 0.50, 0]; b[4] = [0.51, 0.50, 0];
  assert.equal(r.detect([a, b]), "heart_hands");
});

// Muscle heart: upper hand upside-down (fingers drooping), lower hand upright and lower-left,
// fingertips touching, lower thumb pointing down at the bicep.
const muscle = () => {
  const up = makeHand({ index: 1, middle: 1, ring: 1, pinky: 1 }, { at: [0.6, 0.3], scale: S, rotate: Math.PI });
  const lo = makeHand({ index: 1, middle: 1, ring: 1, pinky: 1 }, { at: [0.5, 0.75], scale: S });
  const dx = up[8][0] - lo[8][0] + 0.005, dy = up[8][1] - lo[8][1] + 0.005;
  for (const i of [5, 6, 7, 8, 9, 10, 11, 12]) lo[i] = [lo[i][0] + dx * (i % 4 === 0 ? 1 : 0.6), lo[i][1] + dy * (i % 4 === 0 ? 1 : 0.6), 0];
  lo[4] = [lo[0][0] + 0.03, lo[0][1] + 0.05, 0];            // thumb points down
  return [up, lo];
};

test("muscle heart", () => {
  const [up, lo] = muscle();
  assert.ok(muscleHeart(up, lo));
  assert.equal(new TrendRules().detect([up, lo]), "muscle_heart");
  assert.equal(new TrendRules().detect([lo, up]), "muscle_heart");    // hand order doesn't matter
});

test("classic heart hands is not muscle heart, and vice versa", () => {
  const a = hand({}), b = hand({});
  a[8] = [0.50, 0.40, 0]; b[8] = [0.51, 0.40, 0];
  a[4] = [0.50, 0.50, 0]; b[4] = [0.51, 0.50, 0];
  assert.ok(!muscleHeart(a, b));
  const [up, lo] = muscle();
  const far = lo.map(([x, y]) => [x - 0.3, y, 0]);              // hands apart: no fingertip contact
  assert.ok(!muscleHeart(up, far));
});

test("6-7 see-saw motion", () => {
  const r = new TrendRules();
  const open = { index: 1, middle: 1, ring: 1, pinky: 1 };
  let got = null;
  for (let t = 0; t < 30 && !got; t++) {
    const dy = 0.06 * Math.sin(t * 0.6);
    got = r.detect([makeHand(open, { at: [0.3, 0.6 + dy], scale: S }), makeHand(open, { at: [0.7, 0.6 - dy], scale: S })]);
  }
  assert.equal(got, "six_seven");
});

test("6-7 fires within one swing, even with curled (palms-up) fingers and a dropped frame", () => {
  const r = new TrendRules();
  let at = -1;
  for (let t = 0; t < 20 && at < 0; t++) {
    const dy = 0.035 * Math.sin(t * 0.5);
    const hands = t === 5 ? [makeHand({}, { at: [0.3, 0.6 + dy], scale: S })]          // tracking hiccup
                          : [makeHand({}, { at: [0.3, 0.6 + dy], scale: S }), makeHand({}, { at: [0.7, 0.6 - dy], scale: S })];
    if (r.detect(hands) === "six_seven") at = t;
  }
  assert.ok(at >= 0 && at <= 12, `detected at frame ${at}`);
});

test("two still hands are not 6-7", () => {
  const r = new TrendRules();
  for (let t = 0; t < 30; t++)
    assert.notEqual(r.detect([makeHand({}, { at: [0.3, 0.6], scale: S }), makeHand({}, { at: [0.7, 0.6], scale: S })]), "six_seven");
});

test("both hands moving together is not 6-7", () => {
  const r = new TrendRules();
  const open = { index: 1, middle: 1, ring: 1, pinky: 1 };
  for (let t = 0; t < 30; t++) {
    const dy = 0.06 * Math.sin(t * 0.6);
    assert.notEqual(r.detect([makeHand(open, { at: [0.3, 0.6 + dy], scale: S }), makeHand(open, { at: [0.7, 0.6 + dy], scale: S })]), "six_seven");
  }
});
