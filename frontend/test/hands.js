// Synthetic hand builder for rule tests. Upright hand, wrist at origin, fingers point up (-y).
const MCP = { index: [-0.35, -0.95], middle: [-0.1, -1.05], ring: [0.12, -1.0], pinky: [0.32, -0.88] };
const BASE = { index: 5, middle: 9, ring: 13, pinky: 17 };

export function makeHand(ext = {}, { at = [0, 0], scale = 1, rotate = 0 } = {}) {
  const p = new Array(21);
  p[0] = [0, 0];
  // thumb chain (1..4): out to the right-up when extended, tucked across the palm when curled
  p[1] = [0.25, -0.25]; p[2] = [0.45, -0.45];
  if (ext.thumb) { p[3] = [0.65, -0.65]; p[4] = [0.85, -0.85]; } else { p[3] = [0.3, -0.65]; p[4] = [0.05, -0.75]; }
  for (const [f, mcp] of Object.entries(MCP)) {
    const b = BASE[f], n = Math.hypot(...mcp), dir = [mcp[0] / n, mcp[1] / n];
    p[b] = mcp;
    if (ext[f]) {
      [0.4, 0.65, 0.85].forEach((k, i) => { p[b + 1 + i] = [mcp[0] + dir[0] * k, mcp[1] + dir[1] * k]; });
    } else {
      p[b + 1] = [mcp[0], mcp[1] - 0.35]; p[b + 2] = [mcp[0], mcp[1] - 0.15]; p[b + 3] = [mcp[0], mcp[1] + 0.1];
    }
  }
  const c = Math.cos(rotate), s = Math.sin(rotate);
  return p.map(([x, y]) => [at[0] + scale * (x * c - y * s), at[1] + scale * (x * s + y * c), 0]);
}

export const RIGHT = Math.PI / 2;
