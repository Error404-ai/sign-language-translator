import { api } from "./api.js";

export const $ = id => document.getElementById(id);
export const pretty = label => String(label).replaceAll("_", " ");

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function badge(state, text) { const b = $("badge"); b.className = "badge " + state; b.textContent = text; }
export function meta(text) { $("meta").textContent = text; }
export function big(text, unsure = false) { const b = $("big"); b.textContent = text; b.className = unsure ? "unsure" : ""; }

export function top3(rows, fmt = pretty) {
  $("top3").replaceChildren(...rows.map(t => {
    const row = el("div", "bar"), track = el("div"), fill = el("i");
    fill.style.width = (t.confidence * 100).toFixed(0) + "%"; track.append(fill);
    row.append(el("span", null, fmt(t.label)), track, el("span", null, (t.confidence * 100).toFixed(0) + "%"));
    return row;
  }));
}

// ---------- sentence ----------
const words = [];
const renderSentence = () => { $("sentence").textContent = words.join(" ") || " "; };
export const sentence = {
  add(w) { words.push(w); renderSentence(); },
  undo() { words.pop(); renderSentence(); },
  clear() { words.length = 0; renderSentence(); },
  text: () => words.join(" "),
};

// ---------- history ----------
export async function refreshHistory(fmt = pretty) {
  try {
    const rows = await api.history(6);
    $("hist").replaceChildren(...rows.map(r => {
      const li = el("li"); li.append(el("b", null, fmt(r.label)), ` ${(r.confidence * 100).toFixed(0)}%`);
      if (r.mode && r.mode !== "words") li.append(el("small", "tag", r.mode));
      return li;
    }));
  } catch { /* backend down: keep old list */ }
}
