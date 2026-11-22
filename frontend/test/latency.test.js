import { test } from "node:test";
import assert from "node:assert/strict";
import { LatencyMeter, percentile } from "../js/latency.js";

test("percentile interpolates like numpy", () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([10], 0.95), 10);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([5, NaN, 1], 0.5), 3);
});

test("meter keeps the last N and summarises totalMs", () => {
  const m = new LatencyMeter(3);
  for (const t of [500, 100, 200, 300]) m.add({ totalMs: t, mediapipeMs: 10, networkMs: 5, serverMs: 40, mlMs: 30, renderMs: 8, transport: "ws" });
  assert.deepEqual(m.stat(), { n: 3, p50: 200, p95: 290 });
  assert.match(m.text(), /p95 290 ms .*⚠️.*via ws/);          // over the 280 ms target
  assert.match(m.text(300), /✅/);
});
