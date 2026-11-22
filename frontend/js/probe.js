import { api } from "./api.js";
import { LatencyMeter } from "./latency.js";
import { $ } from "./ui.js";

/**
 * Latency probe. Call measure() right after a result has been written to the DOM; it waits for the
 * next paint, builds the sample, shows p50/p95 in the debug panel and batches samples to the backend
 * (GET /api/latency gives the report table).
 */
const meters = {};
let queue = [];
setInterval(() => { if (queue.length) { api.reportLatency(queue).catch(() => {}); queue = []; } }, 3000);

export function measure(mode, { t, detectMs, endWaitMs }, d) {
  const received = performance.now();
  requestAnimationFrame(() => {
    const painted = performance.now();
    const sample = {
      mode, transport: d.transport,
      totalMs: painted - t,
      mediapipeMs: detectMs,
      networkMs: Math.max(0, d.roundTripMs - (d.latencyMs ?? 0)),
      serverMs: d.latencyMs, mlMs: d.mlMs, inferenceMs: d.inferenceMs,
      renderMs: painted - received,
      endWaitMs,
    };
    (meters[mode] ??= new LatencyMeter()).add(sample);
    $("lat").textContent = `${mode}: ${meters[mode].text()}`;
    queue.push(sample);
  });
}
