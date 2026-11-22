import { api } from "./api.js";
import { config } from "./config.js";

/**
 * Speech -> text.
 *   1. Whisper (preferred): record with MediaRecorder, upload to /api/transcribe. Works in every modern
 *      browser. Hindi is spoken -> Whisper "translate" -> English text, which the sign vocabulary understands.
 *   2. Fallback: the browser Web Speech API (Chrome / Edge only) when the Whisper server isn't available.
 * Click once to start, click again to stop (recording also stops by itself after config.speech.maxMs).
 */
const WEB_SPEECH_LANG = { en: "en-IN", hi: "hi-IN" };

export function setupMic({ button, info, langSelect, onText }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  const idleLabel = button.textContent;
  let recorder = null;
  const say = t => { info.textContent = t ? " " + t : ""; };

  async function whisperAvailable() {
    try { return !!(await api.health()).whisper; } catch { return false; }
  }

  async function recordWhisper(lang) {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { return say("microphone blocked: " + e.message); }
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    const timer = setTimeout(() => recorder?.state === "recording" && recorder.stop(), config.speech.maxMs);
    recorder.onstop = async () => {
      clearTimeout(timer);
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      recorder = null; button.textContent = idleLabel; button.disabled = true;
      say("transcribing…");
      try {
        const task = lang === "en" ? "transcribe" : "translate";      // Hindi -> English for the gloss
        const d = await api.transcribe(blob, lang, task);
        say(d.text ? `Whisper · ${d.language}${task === "translate" ? " → en" : ""} · ${(d.latencyMs / 1000).toFixed(1)} s`
                   : "didn't catch anything, try again");
        if (d.text) onText(d.text);
      } catch (e) { say("transcribe failed: " + e.message); }
      finally { button.disabled = false; }
    };
    recorder.start();
    button.textContent = "⏹ Stop";
    say(`recording (${lang === "hi" ? "Hindi" : "English"})… click Stop when done`);
  }

  function webSpeech(lang) {
    const rec = new SR(); rec.lang = WEB_SPEECH_LANG[lang] || "en-IN";
    rec.onresult = e => onText(e.results[0][0].transcript);
    rec.onend = () => say("");
    rec.onerror = e => say(e.error);
    say(lang === "hi" ? "listening (browser mic: Hindi text won't map to signs; start the Whisper server for that)…"
                      : "listening…");
    rec.start();
  }

  button.onclick = async () => {
    if (recorder) return recorder.stop();
    const lang = langSelect?.value || "en";
    if (canRecord && await whisperAvailable()) return recordWhisper(lang);
    if (SR) return webSpeech(lang);
    say("speech input needs the Whisper server (pip install faster-whisper) or Chrome/Edge");
  };
}

export function speak(text) {
  if (text) speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
