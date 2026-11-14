// Начало игры на ТВ: пустой фон → интро (вылет логотипа) → тропа с QR → отсчёт 3-2-1 и вспышка.
// Кнопок нет — всё переключает ведущий с пульта («Далее», «Начать игру»).
import { useEffect, useRef, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import { COUNTDOWN_MS, type GameState } from '../shared/types';
import { LOGO_URL, LOGO_TEXT_URL } from '../shared/logo';
import { playSound } from '../shared/sounds';
import { now } from '../shared/util';
import { PixIcon, PixelImg } from '../ui/common';
import { LobbyScene } from './lobbyScene';

/** холст тропы + подписи с именами над головами */
function Trail({ s }: { s: GameState }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<LobbyScene | null>(null);
  const tags = useRef<HTMLDivElement>(null);
  const players = s.joinOrder.map((id) => s.players[id]).filter(Boolean).slice(0, 10);
  useEffect(() => {
    const sc = new LobbyScene(cv.current!);
    scene.current = sc;
    // подписи двигаем напрямую, без перерисовки компонента каждый кадр
    sc.onLabels = (pos) => {
      const box = tags.current;
      if (!box) return;
      for (const el of Array.from(box.children) as HTMLElement[]) {
        const p = pos[el.dataset.pid!];
        el.style.display = p ? '' : 'none';
        if (p) { el.style.left = p.x * 100 + '%'; el.style.top = p.y * 100 + '%'; }
      }
    };
    const onResize = () => sc.resize();
    addEventListener('resize', onResize);
    return () => { removeEventListener('resize', onResize); sc.destroy(); };
  }, []);
  useEffect(() => {
    scene.current?.setWalkers(players.map((p) => ({ id: p.id, name: p.name, look: p })));
  });
  return (
    <div class="trail">
      <canvas ref={cv} class="trail-cv" />
      <div class="trail-tags" ref={tags}>
        {players.map((p) => <div key={p.id} data-pid={p.id} class="trail-tag" style={{ display: 'none', '--pc': p.color } as any}>{p.name}</div>)}
      </div>
    </div>
  );
}

function BigLogo({ cls }: { cls: string }) {
  if (LOGO_URL) return <img class={cls} src={LOGO_URL} alt="BIG GAME 2" draggable={false} />;
  if (LOGO_TEXT_URL) return <div class={cls}><PixelImg src={LOGO_TEXT_URL} scale={6} alt="BIG GAME 2" /></div>;
  return <div class={cls + ' logo-fallback'}><b>BIG GAME 2</b><span>ビッグゲーム 2</span></div>;
}

/** экран с QR поверх тропы */
function JoinCard({ s, url, warn }: { s: GameState; url: string; warn: string | null }) {
  const [qr, setQr] = useState('');
  useEffect(() => { void QRCode.toDataURL(url, { margin: 1, scale: 8 }).then(setQr); }, [url]);
  const n = s.joinOrder.filter((id) => s.players[id]).length;
  return (
    <>
      <div class="trail-logo pop"><BigLogo cls="trail-logo-img" /></div>
      <div class="join-card pop">
        {qr && <img class="qr" src={qr} alt="QR" />}
        <div class="join-text">
          <b>Сканируй и заходи!</b>
          <span>Комната <b>{s.room}</b></span>
          <span class="join-n">Игроки: {n}/10</span>
        </div>
      </div>
      {warn && <div class="join-warn"><PixIcon id="ui_warn" /> {warn}</div>}
    </>
  );
}

/** отсчёт: цифры по секундам, в конце экран белеет. Звуки — только будущие (после перезагрузки ТВ не догоняем) */
function Countdown({ at }: { at: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const marks: [number, string][] = [[500, 'count3'], [1500, 'count2'], [2500, 'count1'], [3500, 'toMap']];
    const ts = marks.map(([ms, id]) => {
      const d = at + ms - now();
      return d > -250 ? setTimeout(() => { playSound(id); tick((x) => x + 1); }, Math.max(0, d)) : null;
    });
    let raf = 0;
    const loop = () => { tick((x) => x + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { ts.forEach((t) => t && clearTimeout(t)); cancelAnimationFrame(raf); };
  }, [at]);
  const e = now() - at;
  const num = e < 500 ? null : e < 1500 ? 3 : e < 2500 ? 2 : e < 3400 ? 1 : null;
  const white = Math.max(0, Math.min(1, (e - 3150) / (COUNTDOWN_MS - 3150)));
  return (
    <>
      <div class="count-dim" style={{ opacity: Math.min(1, e / 500) * 0.35 }} />
      {num && <div key={num} class="count-num">{num}</div>}
      <div class="whiteout" style={{ opacity: white }} />
    </>
  );
}

export function LobbyTv({ s, url, warn }: { s: GameState; url: string; warn: string | null }) {
  const st = s.stage;
  const show = st.t === 'countdown' ? 'walk' : st.t === 'lobby' ? st.show ?? 'walk' : 'walk';
  return (
    <div class={'lobby-tv show-' + show}>
      {show === 'blank' && <div class="lobby-blank" />}
      {show === 'intro' && (
        <div class="lobby-intro">
          <div class="intro-rays" />
          <BigLogo cls="intro-logo" />
        </div>
      )}
      {show === 'walk' && (
        <>
          <Trail s={s} />
          {st.t === 'lobby' && <JoinCard s={s} url={url} warn={warn} />}
          {st.t === 'countdown' && <Countdown at={st.at} />}
        </>
      )}
      {/* до тропы код комнаты нужен ведущему, чтобы подключить пульт */}
      {st.t === 'lobby' && show !== 'walk' && <div class="lobby-room">{s.room}</div>}
    </div>
  );
}

/** вспышка поверх карты после отсчёта — тает за секунду */
export function MapFlash() {
  return <div class="whiteout fade" />;
}
