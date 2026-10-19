// Иайдо на телефоне: весь экран — кнопка удара, на нём катана в ножнах. Сигнал «!» только на ТВ — телефон его не знает.
// Время нажатия шлём по часам хоста (как ответы на вопросы), поэтому сеть не влияет на победителя.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameClient } from '../shared/client';
import type { GroupPublic, Player } from '../shared/types';
import { useFrame } from '../ui/common';
import { vibrate } from '../shared/util';
import { runPetals } from '../games/petals';
import bgUrl from '../img/iaido/bg.png';
import katanaUrl from '../img/iaido/katana.png';
import sayaUrl from '../img/iaido/saya.png';

/** фон (ночная сакура, лепестки) и меч; drawn — клинок выхвачен, foul — фальстарт */
function IaiScene({ drawn, foul, live, children }: { drawn: boolean; foul: boolean; live: boolean; children: any }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => runPetals(cv.current!, 30), []);
  return (
    <>
      <img class="iai-pad-bg" src={bgUrl} alt="" draggable={false} />
      <canvas ref={cv} class="iai-pad-petals" width={180} height={320} />
      <div class="iai-pad-top">{children}</div>
      <div class={'iai-sword' + (drawn ? ' drawn' : '') + (foul ? ' foul' : '') + (live ? ' live' : '')}>
        <img class="iai-katana" src={katanaUrl} alt="" draggable={false} />
        <img class="iai-saya" src={sayaUrl} alt="" draggable={false} />
        {drawn && !foul && <div class="iai-pad-slash" />}
      </div>
    </>
  );
}

/** нажатия по раундам: «игра:раунд» → время хоста (переживает перерисовки) */
const presses = new Map<string, number>();

export function IaidoPad({ client, g, me }: { client: GameClient; g: GroupPublic; me: Player }) {
  const iai = g.iai;
  const key = iai ? `${g.id}:${iai.round}` : '';
  const [, bump] = useState(0);
  const ready = iai?.step === 'ready';
  // ждём, когда откроется раунд (startAt), — перерисовка по кадрам
  useFrame(ready && client.hostNow() < g.startAt);
  const at = presses.get(key);
  const early = !!iai?.early.includes(me.id);
  const cut = !!iai?.cut.includes(me.id);

  // сообщения могут теряться — досылаем, пока хост не отметит нажатие
  useEffect(() => {
    if (at == null || !ready || early || cut) return;
    const send = () => client.pick('iaido', { r: iai!.round, at });
    const t = setInterval(send, 800);
    return () => clearInterval(t);
  }, [key, at, ready, early, cut]);

  if (g.phase === 'intro' || !iai) {
    return (
      <div class="iai-pad wait">
        <IaiScene drawn={false} foul={false} live={false}>
          <div class="iai-pad-big">斬</div>
          <div class="iai-pad-text">Иайдо: жми, когда на ТВ вспыхнет «!»</div>
          <div class="muted small-text">Слушай ведущего</div>
        </IaiScene>
      </div>
    );
  }

  const open = ready && client.hostNow() >= g.startAt;
  const strike = (e: PointerEvent) => {
    e.preventDefault();
    if (!open || presses.has(key)) return;
    // момент касания, а не обработки: поправка на задержку события
    const lag = Math.max(0, Math.min(100, performance.now() - e.timeStamp));
    const t = client.hostNow() - lag;
    presses.set(key, t);
    client.pick('iaido', { r: iai.round, at: t });
    vibrate(60);
    bump((x) => x + 1);
  };

  const myTime = iai.times?.[me.id];
  const place = iai.step === 'done' ? [...iai.cut].sort((a, b) => (iai.times![a] ?? 0) - (iai.times![b] ?? 0)).indexOf(me.id) : -1;
  let big = '斬';
  let text = 'Жди «!» на ТВ…';
  let cls = 'iai-pad';
  if (!open && ready) { text = 'Приготовься…'; cls += ' wait'; }
  if (early) { big = '✗'; text = 'Рано! Выбываешь из раунда'; cls += ' out'; }
  else if (at != null && ready) { big = '✔'; text = 'Удар нанесён!'; cls += ' hit'; }
  if (iai.step === 'done') {
    cls = 'iai-pad done' + (early ? ' out' : '');
    if (!early) {
      big = myTime != null ? (place === 0 ? '斬' : `${place + 1}`) : '—';
      text = myTime != null ? `${myTime} мс${place === 0 ? ' — ты первый!' : ''}` : 'Не успел';
    }
  }
  return (
    <div class={cls} onPointerDown={strike}>
      <IaiScene drawn={early || at != null || myTime != null} foul={early} live={open && at == null && !early}>
        <div class="iai-pad-round">Раунд {iai.round} / {iai.rounds}</div>
        <div class="iai-pad-big">{big}</div>
        <div class="iai-pad-text">{text}</div>
        <div class="muted small-text">Смотри на ТВ, а не в телефон</div>
      </IaiScene>
    </div>
  );
}
