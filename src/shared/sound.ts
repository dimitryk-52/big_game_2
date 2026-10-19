// 8-битные звуки на WebAudio (без файлов) + музыка для ритм-игры.
import { DRAGON_BAR, DRAGON_COUNT, RHYTHM_LEAD_BEATS, rhythmChart, type DragonTiming } from '../games/logic';
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

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, when = 0, slide = 0, out?: AudioNode) {
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
  o.connect(g).connect(out ?? master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.3, when = 0, hp = 1000, out?: AudioNode) {
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
  src.connect(f).connect(g).connect(out ?? master!);
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
  slash: () => { noise(0.25, 0.45, 0, 2500); tone(900, 0.2, 'sawtooth', 0.15, 0, -700); },
  early: () => { tone(160, 0.3, 'square', 0.2); },
  /** кости в стакане: дробь щелчков и удар стакана о сукно */
  rattle: () => { for (let i = 0; i < 14; i++) noise(0.025, 0.12, i * 0.08 + Math.random() * 0.03, 3000); noise(0.12, 0.35, 1.2, 500); },
  /** нож по рыбе */
  chop: () => { noise(0.06, 0.3, 0, 2500); tone(180, 0.1, 'square', 0.25, 0.03, -60); },
  jackpot: () => { for (let i = 0; i < 12; i++) tone(600 + i * 80, 0.08, 'square', 0.18, i * 0.06); },
  stumble: () => { noise(0.25, 0.35, 0, 300); tone(200, 0.3, 'triangle', 0.3, 0, -140); tone(120, 0.4, 'square', 0.15, 0.12, -60); },
};

/**
 * Барабаны джа-одори на ТВ: отсчёт «ка» по краю, на каждый шаг — удар «дон», в начале такта — акцент
 * и нота флейты, на старте зачёта — гонг. Ноты планируются порциями на полсекунды вперёд,
 * поэтому танец можно остановить в любой момент (возвращаемая функция).
 */
export function startDragonDrums(d: DragonTiming, times: number[], latencyMs = 0): () => void {
  const a = audio();
  const out = a.createGain();
  out.connect(master!);
  const outLat = ((a as any).outputLatency ?? 0) + (a.baseLatency ?? 0);
  // время хоста → время AudioContext (с поправкой на задержку вывода)
  const at = (th: number) => Math.max(0, (th - now()) / 1000 - outLat - latencyMs / 1000);
  const beat0 = 60000 / d.bpm;
  const count = Array.from({ length: DRAGON_COUNT }, (_, i) => d.startAt + i * beat0);
  // пентатоника для флейты-синобуэ
  const fue = [0, 2, 5, 7, 9, 12, 14].map((x) => 880 * Math.pow(2, x / 12));
  const r = rng(d.startAt);
  let ci = 0, si = 0;
  const pump = () => {
    if (!soundOn) return;
    const horizon = now() + 600;
    for (; ci < count.length && count[ci] < horizon; ci++) {
      if (count[ci] < now() - 50) continue;
      tone(ci === count.length - 1 ? 1400 : 1000, 0.05, 'square', 0.25, at(count[ci]), 0, out);
      noise(0.03, 0.2, at(count[ci]), 4000, out);
    }
    for (; si < times.length && times[si] < horizon; si++) {
      if (times[si] < now() - 50) continue;
      const w = at(times[si]);
      const bar = si >= d.warm && (si - d.warm) % DRAGON_BAR === 0;
      tone(bar ? 75 : 95, bar ? 0.35 : 0.22, 'sine', bar ? 0.9 : 0.6, w, -40, out); // дон
      noise(0.06, bar ? 0.3 : 0.15, w, 600, out);
      if (si % 2) noise(0.02, 0.07, w + (times[si + 1] - times[si] || 300) / 2000, 7000, out); // ка между шагами
      if (si === d.warm) { tone(55, 1.6, 'triangle', 0.5, w, 0, out); noise(1.2, 0.18, w, 2500, out); } // гонг: начался зачёт
      if (bar || (si % 4 === 0 && r() < 0.6)) tone(fue[Math.floor(r() * fue.length)], 0.18, 'triangle', 0.12, w, 0, out);
    }
  };
  pump();
  const timer = setInterval(pump, 150);
  return () => {
    clearInterval(timer);
    out.gain.setTargetAtTime(0, a.currentTime, 0.05);
    setTimeout(() => out.disconnect(), 400);
  };
}

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

/**
 * Иайдо: «кин!» точно в момент сигнала (время хоста) и «ток» бамбука на ложной тревоге.
 * Ставим в очередь AudioContext заранее, чтобы звук не зависел от кадров.
 * parts — какие встроенные звуки нужны (на остальные ведущий поставил свои файлы).
 */
export function iaiSounds(at: number, decoyAt?: number, parts = { signal: true, decoy: true }) {
  const a = audio();
  const outLat = ((a as any).outputLatency ?? 0) + (a.baseLatency ?? 0);
  const when = (t: number) => Math.max(0, (t - now()) / 1000 - outLat);
  const w = when(at);
  if (parts.signal) {
    tone(2093, 0.25, 'square', 0.3, w);
    tone(3136, 0.35, 'triangle', 0.25, w);
    noise(0.08, 0.3, w, 4000);
  }
  if (parts.decoy && decoyAt != null && decoyAt < at) {
    const d = when(decoyAt);
    tone(330, 0.07, 'triangle', 0.5, d, -120);
    tone(250, 0.09, 'triangle', 0.4, d + 0.09, -100);
  }
}
