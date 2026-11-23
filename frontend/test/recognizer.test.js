import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normHand, keypoints, Segmenter, Stabilizer, resample } from "../js/recognizer.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/keypoints.json", import.meta.url)));

test("normHand matches ml/signbridge/keypoints.py", () => {
  fx.hands.forEach((h, i) => normHand(h).forEach((v, j) => assert.ok(Math.abs(v - fx.expected[i][j]) < 1e-5)));
});

test("keypoints puts Left in slot 0 and Right in slot 1", () => {
  const lm = fx.hands[0].map(([x, y, z]) => ({ x, y, z }));
  const out = keypoints({ landmarks: [lm], handedness: [[{ categoryName: "Right" }]] });
  assert.equal(out.length, 130);
  assert.ok(out.slice(0, 65).every(v => v === 0));
  assert.ok(out.slice(65).some(v => v !== 0));
});

test("resample picks evenly spaced frames", () => {
  const r = resample([...Array(59).keys()], 30);
  assert.equal(r.length, 30);
  assert.equal(r[0], 0); assert.equal(r[29], 58);
});

test("Stabilizer emits once after hold time", () => {
  const s = new Stabilizer({ window: 4, need: 3, holdMs: 100 });
  let emits = [];
  for (let t = 0; t <= 300; t += 20) { const r = s.push("A", t); if (r.emit) emits.push(r.emit); }
  assert.deepEqual(emits, ["A"]);
  assert.equal(s.push(null, 320).stable, "A");           // one miss doesn't break it
});

test("Segmenter emits one 30-frame clip for a sign", () => {
  const seg = new Segmenter();
  const frame = k => { const f = new Array(130).fill(0); for (let j = 0; j < 63; j++) f[j] = Math.sin(k + j) * 0.5; f[63] = 0.5; f[64] = 0.5; return f; };
  let out = null;
  for (let k = 0; k < 40 && !out?.sequence; k++) out = seg.push(frame(k));
  for (let k = 0; k < 10 && !out?.sequence; k++) out = seg.push(new Array(130).fill(0));
  assert.equal(out.sequence.length, 30);
});
