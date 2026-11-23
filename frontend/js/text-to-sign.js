import { api } from "./api.js";
import { $ } from "./ui.js";
import { HandPlayer, Skeleton2D } from "./hand-player.js";
import { setupMic } from "./speech.js";

/** Text / speech -> ISL gloss tokens -> chips + hand player. */
export function setupTextToSign() {
  const flat = new Skeleton2D($("hand"));
  const player = new HandPlayer(flat);
  setupViews(player, flat);
  let tokens = [];

  async function translate() {
    const text = $("txt").value.trim();
    if (!text) return;
    try {
      tokens = (await api.textToSign(text)).tokens || [];
      $("chips").replaceChildren(...tokens.map(t => {
        const c = document.createElement("span");
        c.className = "chip " + (t.type === "sign" ? "sign" : "fs");
        c.textContent = t.type === "sign" ? t.text : t.letters.join("-").toUpperCase();
        return c;
      }));
    } catch (e) { $("chips").textContent = "error: " + e.message; }
  }

  $("go").onclick = translate;
  $("txt").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); translate(); } };
  $("play").onclick = () => {
    const chips = [...$("chips").children];
    player.play(tokens, (i, caption) => {
      chips.forEach((c, j) => c.classList.toggle("now", j === i));
      $("stage").textContent = caption;
    });
  };
  setupMic({ button: $("mic"), info: $("micInfo"), langSelect: $("lang"),
             onText: text => { $("txt").value = text; translate(); } });
}

/** 3D avatar by default (Three.js loads from the CDN); 2D skeleton if WebGL / the CDN isn't available. */
async function setupViews(player, flat) {
  const btn = $("view");
  let avatar = null, is3d = false;
  const use = on => {
    is3d = on;
    flat.show(!on); avatar?.show(on);
    player.setView(on ? avatar : flat);
    btn.textContent = on ? "2D view" : "🧊 3D view";
  };
  btn.onclick = () => avatar && use(!is3d);
  try {
    const { Avatar3D } = await import("./avatar3d.js");
    avatar = new Avatar3D($("hand3d"));
    await player.ready;
    use(true);
    $("viewInfo").textContent = "drag to rotate · double-click to reset";
  } catch (e) {
    btn.disabled = true; btn.title = "3D needs WebGL: " + e.message;
    $("viewInfo").textContent = "3D avatar unavailable (" + e.message + "), showing 2D";
  }
}
