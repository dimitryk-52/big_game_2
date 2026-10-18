// 8-битные звуки на WebAudio (без файлов) + музыка для ритм-игры.
import { RHYTHM_LEAD_BEATS, rhythmChart } from '../games/logic';
import { now, rng } from './util';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export let soundOn = true;

export function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
export function unlockAudio() {
  audio();
}
export function setSound(on: boolean) {
  soundOn = on;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, when = 0, slide = 0) {
  if (!soundOn) return;
  const a = audio();
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.3, when = 0, hp = 1000) {
  if (!soundOn) return;
  const a = audio();
  const t = a.currentTime + when;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
}

export const sfx = {
  click: () => tone(660, 0.05, 'square', 0.15),
  tick: () => tone(1200, 0.03, 'square', 0.08),
  answered: () => { tone(880, 0.06, 'square', 0.18); tone(1320, 0.08, 'square', 0.12, 0.05); },
  question: () => { tone(523, 0.1, 'square', 0.2); tone(659, 0.1, 'square', 0.2, 0.1); tone(784, 0.18, 'square', 0.2, 0.2); },
  correct: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.2, i * 0.08)); },
  wrong: () => { tone(220, 0.25, 'sawtooth', 0.2); tone(180, 0.35, 'sawtooth', 0.2, 0.15); },
  reveal: () => { tone(392, 0.08, 'triangle', 0.3); tone(784, 0.2, 'triangle', 0.3, 0.08); },
  hit: () => { noise(0.2, 0.4, 0, 400); tone(140, 0.25, 'square', 0.3, 0, -80); },
  join: () => { tone(784, 0.07, 'square', 0.2); tone(1175, 0.12, 'square', 0.2, 0.07); },
  land: () => { tone(300, 0.15, 'triangle', 0.3, 0, 300); noise(0.15, 0.15, 0.1, 2000); },
  step: () => tone(500, 0.05, 'square', 0.12, 0, 200),
  coin: () => { tone(988, 0.06, 'square', 0.2); tone(1319, 0.2, 'square', 0.2, 0.06); },
  duel: () => { [196, 196, 262, 196, 311, 294].forEach((f, i) => tone(f, 0.14, 'sawtooth', 0.18, i * 0.13)); },
  fanfare: () => { [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 7 ? 0.6 : 0.12, 'square', 0.22, i * 0.12)); },
  pachi: () => tone(1500 + Math.random() * 600, 0.02, 'square', 0.05),
  jackpot: () => { for (let i = 0; i < 12; i++) tone(600 + i * 80, 0.08, 'square', 0.18, i * 0.06); },
};

/**
 * Музыка ритм-игры на ТВ. startAt — время хоста нулевой доли.
 * Ноты чарта дополнительно озвучиваются «колокольчиком», чтобы ритм был слышен.
 */
export function playRhythmMusic(seed: number, bpm: number, beats: number, startAt: number, latencyMs = 0) {
  const a = audio();
  const spb = 60 / bpm;
  // переводим время хоста во время AudioContext; компенсируем задержку вывода звука
  const outLat = ((a as any).outputLatency ?? 0) + (a.baseLatency ?? 0);
  const t0 = a.currentTime + (startAt - now()) / 1000 - outLat - latencyMs / 1000;
  const r = rng(seed);
  const scale = [0, 3, 5, 7, 10, 12];
  const root = 110 * Math.pow(2, Math.floor(r() * 5) / 12);
  const notes = rhythmChart(seed, beats);
  const at = (b: number) => Math.max(a.currentTime, t0 + b * spb) - a.currentTime;
  for (let b = 0; b < beats; b++) {
    // отсчёт
    if (b < RHYTHM_LEAD_BEATS) { tone(b === RHYTHM_LEAD_BEATS - 1 ? 1320 : 880, 0.06, 'square', 0.25, at(b)); continue; }
    tone(60, 0.18, 'sine', 0.6, at(b), -30); // бочка
    if (b % 2 === 1) noise(0.12, 0.25, at(b), 1500); // малый
    noise(0.03, 0.08, at(b + 0.5), 6000); // хэт
    const deg = scale[Math.floor(r() * scale.length)];
    tone(root * Math.pow(2, deg / 12), spb * 0.9, 'triangle', 0.25, at(b)); // бас
  }
  for (const n of notes) tone(523 * Math.pow(2, [0, 4, 7, 12][n.lane] / 12), 0.1, 'square', 0.12, at(n.beat));
}
