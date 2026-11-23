import { api } from "../api.js";
import { config } from "../config.js";
import { Stabilizer } from "../recognizer.js";
import { measure } from "../probe.js";
import { badge, big, meta, refreshHistory, sentence, top3 } from "../ui.js";

/** Static A-Z fingerspelling: classify single frames, keep a letter once it is held steady. */
export function lettersMode(state) {
  const stab = new Stabilizer(config.letters);
  let busy = false, lastT = -Infinity, session = 0;   // session: bumped on exit so late answers are dropped

  async function classify(kp, timing) {
    busy = true;
    const mine = session;
    try {
      const d = await api.predictLetter(kp, state.minConf);
      if (mine !== session) return;                       // user switched mode while this was in flight
      const { stable, emit } = stab.push(d.accepted ? d.label : null);
      big(stable ?? "…", !stable);
      top3(d.top3, l => l);
      meta(`${d.label} ${(d.confidence * 100).toFixed(0)}% · ${d.transport} · server ${d.latencyMs} ms`);
      measure("letters", timing, d);
      if (emit) { sentence.add(emit); api.log("letters", emit, d.confidence).then(() => refreshHistory()).catch(() => {}); }
    } catch (e) { if (mine === session) meta("error: " + e.message); }
    finally { busy = false; }
  }

  return {
    id: "letters", label: "Letters",
    enter() { stab.reset(); big("—"); },
    exit() { session++; stab.reset(); },
    onFrame({ kp, handsSeen, t, detectMs }) {
      if (!handsSeen) { stab.reset(); big("—"); badge("", "show a letter"); return; }
      badge("capturing", "letters mode");
      if (!busy && t - lastT >= config.letters.everyMs) { lastT = t; classify(kp, { t, detectMs }); }
    },
  };
}
