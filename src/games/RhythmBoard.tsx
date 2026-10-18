// Ритм-игра: 4 дорожки, ноты падают к линии. Время — по часам хоста,
// поэтому телефон и музыка на ТВ идут синхронно (окно попадания ±150 мс).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Player, RhythmPublic } from '../shared/types';
import { RHYTHM_LEAD_BEATS, RHYTHM_WINDOW, rhythmChart } from './logic';
import { vibrate } from '../shared/util';

const LANE_COLORS = ['#ff4d6d', '#ffd23f', '#5ce16b', '#4dabff'];

export function RhythmBoard({ r, now, spectator, players, onDone }: {
  r: RhythmPublic;
  now: () => number;
  spectator?: boolean;
  players?: Record<string, Player>;
  onDone?: (score: number, hits: number, total: number) => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const st = useRef({ score: 0, hits: 0, combo: 0, judged: new Set<number>(), fx: [] as { lane: number; text: string; t: number }[], done: false, pressed: [0, 0, 0, 0] });
  const [score, setScore] = useState(0);
  const notes = useRef(rhythmChart(r.seed, r.beats));
  const msPerBeat = 60000 / r.bpm;
  const noteTime = (b: number) => r.startAt + b * msPerBeat;
  const endTime = noteTime(r.beats + 1);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = cv.current;
      if (!c) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const t = now();
      const s = st.current;
      ctx.fillStyle = '#11142b';
      ctx.fillRect(0, 0, W, H);
      const lw = W / 4;
      const hitY = H * 0.82;
      const look = msPerBeat * 2.2;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#181c3b' : '#1c2145';
        ctx.fillRect(i * lw, 0, lw, H);
        if (t - s.pressed[i] < 120) {
          ctx.fillStyle = LANE_COLORS[i] + '44';
          ctx.fillRect(i * lw, 0, lw, H);
        }
      }
      // линия попадания
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, hitY - 2, W, 4);
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = LANE_COLORS[i];
        ctx.lineWidth = 3;
        ctx.strokeRect(i * lw + 8, hitY - 14, lw - 16, 28);
      }
      // отсчёт
      const beatNow = (t - r.startAt) / msPerBeat;
      if (beatNow < RHYTHM_LEAD_BEATS) {
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.floor(H / 8)}px DotGothic16, monospace`;
        ctx.textAlign = 'center';
        const n = beatNow < 0 ? '…' : String(RHYTHM_LEAD_BEATS - Math.floor(beatNow));
        ctx.fillText(n, W / 2, H * 0.4);
      }
      notes.current.forEach((n, idx) => {
        if (s.judged.has(idx)) return;
        const dt = noteTime(n.beat) - t;
        if (dt > look || dt < -RHYTHM_WINDOW.good - 200) return;
        if (!spectator && dt < -RHYTHM_WINDOW.good && !s.judged.has(idx)) {
          s.judged.add(idx);
          s.combo = 0;
          s.fx.push({ lane: n.lane, text: 'мимо', t });
          return;
        }
        const y = hitY - (dt / look) * hitY;
        ctx.fillStyle = LANE_COLORS[n.lane];
        ctx.fillRect(n.lane * lw + 10, y - 10, lw - 20, 20);
        ctx.fillStyle = '#fff';
        ctx.fillRect(n.lane * lw + 10, y - 10, lw - 20, 4);
      });
      ctx.textAlign = 'center';
      ctx.font = '20px DotGothic16, monospace';
      s.fx = s.fx.filter((f) => t - f.t < 600);
      for (const f of s.fx) {
        ctx.globalAlpha = 1 - (t - f.t) / 600;
        ctx.fillStyle = f.text === 'мимо' ? '#ff6b6b' : f.text === 'ИДЕАЛЬНО' ? '#ffd23f' : '#5ce16b';
        ctx.fillText(f.text, f.lane * lw + lw / 2, hitY - 40 - (t - f.t) / 20);
        ctx.globalAlpha = 1;
      }
      if (!spectator && !s.done && t > endTime) {
        s.done = true;
        onDone?.(s.score, s.hits, notes.current.length);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [r.id]);

  const tap = (lane: number) => {
    const t = now();
    const s = st.current;
    s.pressed[lane] = t;
    let best = -1, bd = 1e9;
    notes.current.forEach((n, idx) => {
      if (n.lane !== lane || s.judged.has(idx)) return;
      const d = Math.abs(noteTime(n.beat) - t);
      if (d < bd) { bd = d; best = idx; }
    });
    if (best < 0 || bd > RHYTHM_WINDOW.good) return;
    s.judged.add(best);
    s.hits++;
    s.combo++;
    const perfect = bd <= RHYTHM_WINDOW.perfect;
    s.score += (perfect ? 100 : 50) + Math.min(50, s.combo * 2);
    s.fx.push({ lane, text: perfect ? 'ИДЕАЛЬНО' : 'хорошо', t });
    vibrate(15);
    setScore(s.score);
  };

  return (
    <div class="rhythm">
      <div class="rhythm-head">
        {spectator ? (
          <div class="row" style={{ justifyContent: 'center', gap: 24 }}>
            {r.players.map((id) => (
              <span>{players?.[id]?.name}: <b>{r.scores[id] ?? '…'}</b></span>
            ))}
          </div>
        ) : (
          <span>Очки: <b>{score}</b></span>
        )}
      </div>
      <canvas ref={cv} class="rhythm-cv" />
      {!spectator && (
        <div class="rhythm-pads">
          {[0, 1, 2, 3].map((i) => (
            <button
              class="rhythm-pad"
              style={{ background: LANE_COLORS[i] }}
              onPointerDown={(e) => { e.preventDefault(); tap(i); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
