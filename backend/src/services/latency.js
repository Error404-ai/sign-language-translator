/**
 * In-memory store of end-to-end latency samples reported by the browser (one per prediction).
 * Sample fields are milliseconds, e.g. { totalMs, mediapipeMs, networkMs, mlMs, renderMs, endWaitMs, transport }.
 */
const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)) * 10) / 10;
};

export function summarize(samples, fields) {
  const out = { n: samples.length };
  for (const f of fields) {
    const v = samples.map(s => s[f]).filter(Number.isFinite).sort((a, b) => a - b);
    if (v.length) out[f] = { p50: percentile(v, 0.5), p95: percentile(v, 0.95), mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10, n: v.length };
  }
  return out;
}

export const FIELDS = ["totalMs", "mediapipeMs", "networkMs", "serverMs", "mlMs", "inferenceMs", "renderMs", "endWaitMs"];

export function createLatencyLog(max = 2000) {
  const rows = [];
  return {
    add(sample) {
      const clean = { at: new Date().toISOString(), transport: String(sample.transport || "?").slice(0, 8), mode: String(sample.mode || "words").slice(0, 10) };
      for (const f of FIELDS) if (Number.isFinite(sample[f]) && sample[f] >= 0 && sample[f] < 60_000) clean[f] = sample[f];
      if (!Number.isFinite(clean.totalMs)) return false;
      rows.push(clean); if (rows.length > max) rows.shift();
      return true;
    },
    summary(filter = {}) {
      const sel = rows.filter(r => (!filter.transport || r.transport === filter.transport) && (!filter.mode || r.mode === filter.mode));
      const byTransport = {};
      for (const t of new Set(sel.map(r => r.transport))) byTransport[t] = summarize(sel.filter(r => r.transport === t), FIELDS);
      return { ...summarize(sel, FIELDS), byTransport, targetMs: 280 };
    },
    clear() { rows.length = 0; },
  };
}
