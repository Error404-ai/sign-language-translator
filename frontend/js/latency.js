// Pure (no DOM) - unit-tested in frontend/test/latency.test.js.

export function percentile(values, p) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

/**
 * End-to-end latency per prediction, in ms:
 *   totalMs      camera frame that ended the clip captured -> result text painted on screen
 *   mediapipeMs  hand (+face) landmark detection of that frame
 *   networkMs    browser <-> backend, excluding backend work (round trip - serverMs)
 *   serverMs     backend handling incl. the ML call;  mlMs: ML server inference only
 *   renderMs     result received -> next paint
 *   endWaitMs    last moving frame -> clip end (how long the segmenter waits to be sure the sign is over;
 *                a design choice, reported separately from processing latency)
 */
export class LatencyMeter {
  constructor(max = 200) { this.max = max; this.rows = []; }
  add(row) { this.rows.push(row); if (this.rows.length > this.max) this.rows.shift(); }
  stat() {
    const v = this.rows.map(r => r.totalMs);
    return { n: v.filter(Number.isFinite).length, p50: percentile(v, 0.5), p95: percentile(v, 0.95) };
  }
  text(target = 280) {
    const { n, p50, p95 } = this.stat();
    if (!n) return "latency: —";
    const last = this.rows.at(-1), r = Math.round;
    return `latency p50 ${r(p50)} · p95 ${r(p95)} ms (n=${n}, target ≤ ${target}) ${p95 <= target ? "✅" : "⚠️"} · last: ` +
      `mediapipe ${r(last.mediapipeMs)} + net ${r(last.networkMs)} + server ${r(last.serverMs)} (ml ${r(last.mlMs)}) + paint ${r(last.renderMs)} = ${r(last.totalMs)} ms via ${last.transport}`;
  }
}
