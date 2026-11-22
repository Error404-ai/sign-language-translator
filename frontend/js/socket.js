/**
 * Auto-reconnecting WebSocket to the backend (/ws) with request/response matching by id.
 *   const s = new LiveSocket(url); await s.request({ type: "predict", kind, sequence })
 * request() rejects when the socket is not open, so callers can fall back to HTTP.
 */
export class LiveSocket {
  // timeoutMs must exceed the backend's ML timeout (8 s), so a slow model answers (or 504s) before we give up
  constructor(url, { timeoutMs = 12000, maxBackoffMs = 10000 } = {}) {
    Object.assign(this, { url, timeoutMs, maxBackoffMs });
    this.nextId = 1; this.pending = new Map(); this.backoff = 500; this.ws = null;
    this.onstatus = () => {};
    if (typeof WebSocket !== "undefined") this.connect();
  }

  get open() { return this.ws?.readyState === WebSocket.OPEN; }

  connect() {
    const ws = this.ws = new WebSocket(this.url);
    ws.onopen = () => { this.backoff = 500; this.onstatus(true); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id); clearTimeout(p.timer);
      m.ok === false ? p.reject(Object.assign(new Error(m.error), { status: m.status })) : p.resolve(m);
    };
    ws.onclose = () => {
      this.onstatus(false);
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("socket closed")); }
      this.pending.clear();
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, this.maxBackoffMs);
    };
    ws.onerror = () => {};                        // onclose follows and handles reconnecting
  }

  request(msg) {
    if (!this.open) return Promise.reject(Object.assign(new Error("socket not open"), { offline: true }));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("socket timeout")); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ ...msg, id }));
    });
  }
}
