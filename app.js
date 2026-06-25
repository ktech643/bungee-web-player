import { PitchShifter } from './vendor/soundtouch.js';

// ── Bungee web time-stretch player ───────────────────────────────────────────
// The browser's Web Audio `playbackRate` is varispeed (pitch follows speed).
// To match Bungee — independent tempo and pitch — we run audio through
// SoundTouchJS (a WASM-free port of the SoundTouch time-stretch engine).
// The engine is isolated behind this controller, so it can be swapped for the
// Bungee Pro Web SDK without touching the UI.

const ctx = new (window.AudioContext || window.webkitAudioContext)();

let shifter = null;        // current PitchShifter
let buffer = null;         // decoded AudioBuffer
let playing = false;
let seeking = false;
let duration = 0;

// Effect state is kept here so it survives re-creating the shifter on load.
let tempo = 1.0;           // time-stretch factor
let pitchSemitones = 0;    // pitch shift

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const titleEl   = $('title');
const iconEl    = $('icon');
const playBtn   = $('play');
const seekEl    = $('seek');
const curEl     = $('cur');
const durEl     = $('dur');
const tempoEl   = $('tempo');
const tempoVal  = $('tempoVal');
const pitchEl   = $('pitch');
const pitchVal  = $('pitchVal');
const fileInput = $('file');
const dropZone  = $('card');
const toast     = $('toast');

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

function notify(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(notify._t);
  notify._t = setTimeout(() => toast.classList.remove('show'), 4000);
}

function setControlsEnabled(on) {
  playBtn.disabled = !on;
  seekEl.disabled = !on;
  document.querySelectorAll('.skip').forEach((b) => (b.disabled = !on));
}

// ── Engine wiring ─────────────────────────────────────────────────────────────
function createShifter() {
  if (shifter) { try { shifter.disconnect(); } catch (_) {} }
  shifter = new PitchShifter(ctx, buffer, 8192);
  shifter.tempo = tempo;
  shifter.pitchSemitones = pitchSemitones;
  shifter.on('play', (detail) => {
    if (!seeking) {
      const pct = Math.min(100, detail.percentagePlayed);
      seekEl.value = pct;
      curEl.textContent = fmt((pct / 100) * duration);
      if (pct >= 99.95) onEnded();
    }
  });
}

function loadBuffer(decoded, title) {
  stop();
  buffer = decoded;
  duration = decoded.duration;
  durEl.textContent = fmt(duration);
  curEl.textContent = '0:00';
  seekEl.value = 0;
  titleEl.textContent = title;
  setControlsEnabled(true);
  createShifter();
  play();
}

// ── Transport ─────────────────────────────────────────────────────────────────
function play() {
  if (!buffer) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (!shifter) createShifter();
  shifter.connect(ctx.destination);   // SoundTouch pulls only while connected
  playing = true;
  render();
}

function pause() {
  if (shifter) shifter.disconnect();
  playing = false;
  render();
}

function togglePlay() { playing ? pause() : play(); }

function stop() {
  if (shifter) { try { shifter.disconnect(); } catch (_) {} }
  if (shifter) shifter.percentagePlayed = 0;
  playing = false;
  seekEl.value = 0;
  curEl.textContent = '0:00';
  render();
}

function onEnded() {
  if (shifter) { shifter.disconnect(); shifter.percentagePlayed = 0; }
  playing = false;
  seekEl.value = 0;
  curEl.textContent = '0:00';
  render();
}

function skip(seconds) {
  if (!shifter || duration === 0) return;
  const cur = (shifter.percentagePlayed / 100) * duration;   // getter is 0–100
  const pct = Math.max(0, Math.min(100, ((cur + seconds) / duration) * 100));
  shifter.percentagePlayed = pct / 100;   // setter expects a 0–1 fraction
  seekEl.value = pct;
  curEl.textContent = fmt((pct / 100) * duration);
}

function render() {
  iconEl.textContent = playing ? '◈' : '♪';
  iconEl.classList.toggle('pulse', playing);
  playBtn.textContent = playing ? '⏸' : '▶';
}

// ── Effects ───────────────────────────────────────────────────────────────────
tempoEl.oninput = () => {
  tempo = parseFloat(tempoEl.value);
  if (shifter) shifter.tempo = tempo;
  tempoVal.textContent = `×${tempo.toFixed(2)}`;
};
pitchEl.oninput = () => {
  pitchSemitones = parseInt(pitchEl.value, 10);
  if (shifter) shifter.pitchSemitones = pitchSemitones;
  pitchVal.textContent = `${pitchSemitones >= 0 ? '+' : ''}${pitchSemitones} st`;
};
$('reset').onclick = () => {
  tempo = 1.0; pitchSemitones = 0;
  tempoEl.value = 1; pitchEl.value = 0;
  tempoEl.oninput(); pitchEl.oninput();
};

// ── Seek slider ────────────────────────────────────────────────────────────────
seekEl.addEventListener('input', () => {
  seeking = true;
  curEl.textContent = fmt((seekEl.value / 100) * duration);
});
seekEl.addEventListener('change', () => {
  if (shifter) shifter.percentagePlayed = parseFloat(seekEl.value) / 100;   // setter expects 0–1
  seeking = false;
});

// ── Transport buttons ──────────────────────────────────────────────────────────
playBtn.onclick = togglePlay;
$('back').onclick = () => skip(-10);
$('fwd').onclick = () => skip(10);

// ── Loading audio: files, drag & drop, URL, demo tone ───────────────────────────
async function decodeAndLoad(arrayBuffer, title) {
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    loadBuffer(decoded, title);
  } catch (e) {
    notify("Couldn't decode that audio file.");
  }
}

fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  decodeAndLoad(await file.arrayBuffer(), file.name.replace(/\.[^.]+$/, ''));
};
$('pick').onclick = () => fileInput.click();

['dragover', 'dragenter'].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('drop'); }));
['dragleave', 'drop'].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('drop'); }));
dropZone.addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files[0];
  if (file) decodeAndLoad(await file.arrayBuffer(), file.name.replace(/\.[^.]+$/, ''));
});

$('url').onclick = async () => {
  const u = prompt('Audio file URL (must allow cross-origin):');
  if (!u) return;
  try {
    const res = await fetch(u);
    decodeAndLoad(await res.arrayBuffer(), u.split('/').pop());
  } catch (e) {
    notify('Failed to fetch that URL (CORS or network).');
  }
};

// Synthesised melody so the demo is instantly playable with no file.
$('demo').onclick = () => {
  const sr = ctx.sampleRate, len = sr * 6;
  const buf = ctx.createBuffer(2, len, sr);
  const notes = [261.63, 329.63, 392.0, 523.25]; // C E G C
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const note = notes[Math.floor(t) % notes.length];
      const env = Math.sin(Math.PI * (t % 1));        // soft per-second envelope
      d[i] = 0.25 * env * Math.sin(2 * Math.PI * note * t);
    }
  }
  loadBuffer(buf, 'Demo Tone (synth)');
};

// Apple Music: not possible on the web — DRM library tracks can't be decoded
// into PCM for processing (MusicKit JS only plays through Apple's own player).
$('apple').onclick = () =>
  notify("Apple Music can't be time-stretched on the web (DRM). Use a file, URL, or the demo tone.");

// init
setControlsEnabled(false);
render();
