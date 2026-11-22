import { api } from "../api.js";
import { measure } from "../probe.js";
import { Segmenter } from "../recognizer.js";
import { $, badge, big, meta, pretty, refreshHistory, sentence, top3 } from "../ui.js";

/** Word signs: cut the stream into one clip per sign, classify each clip with the LSTM. */
export function wordsMode(state) {
  const seg = new Segmenter();
  let lastActiveT = 0;                       // last frame with hands moving (for the end-of-sign wait)
  let session = 0;                           // bumped on exit so answers arriving after a mode switch are dropped

  async function classify(sequence, timing) {
    badge("predicting", "recognising…");
    const mine = session;
    try {
      const d = await api.predictWord(sequence, state.minConf);
      if (mine !== session) return;
      big(d.accepted ? pretty(d.label) : "not sure", !d.accepted);
      top3(d.top3);
      meta(`${d.transport} · server ${d.latencyMs} ms`);
      measure("words", timing, d);
      if (d.accepted) { sentence.add(pretty(d.label)); refreshHistory(); }
    } catch (e) { if (mine === session) meta("error: " + e.message); }
  }

  return {
    id: "words", label: "Words", seg,
    enter() { seg.reset(); },
    exit() { session++; },
    onFrame({ kp, handsSeen, t, detectMs }) {
      const out = seg.push(kp);
      if (handsSeen && seg.motion > seg.o.still) lastActiveT = t;
      $("mot").textContent = seg.motion.toFixed(3); $("fr").textContent = seg.frames.length;
      if (out?.sequence) classify(out.sequence, { t, detectMs, endWaitMs: lastActiveT ? t - lastActiveT : undefined });
      else if (out?.discarded) badge("", "too short / no movement — try again");
      else if (seg.state === "capturing") badge("capturing", `signing… ${seg.frames.length}`);
      else badge("", handsSeen ? "hands seen — start signing" : "raise your hands to sign");
    },
  };
}
