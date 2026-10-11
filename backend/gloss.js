// Text -> sign sequence. Known words become signs, everything else is fingerspelled.
const DROP = new Set(["a", "an", "the", "is", "am", "are", "was", "were", "be", "been", "to", "of", "do", "does", "did"]);

export function textToSign(text, vocab = [], { gloss = true } = {}) {
  const known = new Set(vocab);
  const words = String(text).toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length;) {
    let hit = null;                                   // longest match first: "thank you" -> thank_you
    for (let n = Math.min(3, words.length - i); n >= 1; n--) {
      const label = words.slice(i, i + n).join("_");
      if (known.has(label)) { hit = { label, n }; break; }
    }
    if (hit) { out.push({ type: "sign", text: words.slice(i, i + hit.n).join(" "), label: hit.label }); i += hit.n; continue; }
    const w = words[i++];
    if (gloss && DROP.has(w)) continue;               // ISL gloss drops articles / "to be"
    out.push({ type: "fingerspell", text: w, letters: [...w.replace(/'/g, "")] });
  }
  return out;
}
