import '../ui/pxStyles';
import { render } from 'preact';
import { loadIcons } from '../shared/sprites';
import { useEffect, useState } from 'preact/hooks';
import '../styles/base.css';
import '../styles/tv.css';
import '../styles/kit.css';
import { Host } from '../host/host';
import { TvApp } from './TvApp';
import { getStore } from '../shared/store';
import { getParam, roomCode } from '../shared/util';
import { unlockAudio } from '../shared/sound';
import { netMode } from '../shared/net';
import { MediaBox } from './MediaBox';
import type { Question } from '../shared/types';
import { LOGO_URL } from '../shared/logo';
import { PixIcon } from '../ui/common';
import { IntroPreview } from './IntroPreview';

function setRoomInUrl(room: string) {
  const u = new URL(location.href);
  u.searchParams.set('room', room);
  history.replaceState(null, '', u.toString());
  localStorage.setItem('bg_tv_room', room);
}

function Boot() {
  const [room, setRoom] = useState(() => getParam('room') ?? localStorage.getItem('bg_tv_room') ?? roomCode());
  const [snap, setSnap] = useState<any>(undefined);
  const [host, setHost] = useState<Host | null>(null);
  const [err, setErr] = useState('');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  useEffect(() => { getStore().loadQuestions().then(setQuestions).catch(() => setQuestions([])); }, []);

  useEffect(() => {
    setRoomInUrl(room);
    getStore().loadSnapshot(room).then(setSnap).catch((e) => { setErr(String(e?.message ?? e)); setSnap(null); });
  }, [room]);

  const start = async (resume: boolean) => {
    unlockAudio();
    const h = new Host(room);
    try {
      await h.start({ resume });
      setHost(h);
      // ?bots=3 — сразу добавить ботов (для тестов)
      const bots = Number(getParam('bots') ?? 0);
      for (let i = 0; i < bots; i++) h.ctl('addBot');
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const newGame = () => {
    const r = roomCode();
    setRoomInUrl(r);
    location.reload();
  };

  if (host) return <TvApp host={host} onNewGame={newGame} />;

  const canResume = snap && snap.s && snap.s.phase !== 'end' && Object.keys(snap.s.players ?? {}).length > 0;
  return (
    <div class="splash">
      <div class="panel pop" style={{ textAlign: 'center', minWidth: 420 }}>
        {LOGO_URL ? <img class="menu-logo" src={LOGO_URL} alt="BIG GAME 2" /> : <>
          <h1 style={{ margin: 0 }}>BIG GAME 2</h1>
          <div style={{ color: 'var(--pink)', marginBottom: 20 }}>ビッグゲーム 2</div>
        </>}
        <div class="muted" style={{ marginBottom: 16 }}>Комната <b style={{ color: '#fff' }}>{room}</b> · сеть: {netMode()} · данные: {getStore().kind}</div>
        {snap === undefined && <div>Загрузка…</div>}
        {snap !== undefined && (
          <div class="col">
            {canResume && (
              <button class="btn primary" onClick={() => start(true)}>
                <PixIcon id="ui_play" size={18} /> Продолжить игру ({Object.keys(snap.s.players).length} игроков, {snap.s.phase === 'turns' ? `круг ${snap.s.round}` : snap.s.phase})
              </button>
            )}
            <button class={'btn ' + (canResume ? '' : 'primary')} onClick={() => (canResume ? newGame() : start(false))}>
              <PixIcon id="ui_plus" size={18} /> Новая игра
            </button>
            {canResume && <button class="btn small ghost" onClick={() => start(false)}>Начать заново в этой же комнате</button>}
            <button class="btn small ghost" onClick={() => { const r = prompt('Код комнаты', room); if (r) setRoom(r.toUpperCase()); }}>Сменить комнату</button>
          </div>
        )}
        <MediaBox questions={questions} />
        {err && <div class="warn" style={{ marginTop: 12 }}>Ошибка: {err}</div>}
        <div class="muted" style={{ marginTop: 16, fontSize: 13 }}>Клик нужен, чтобы браузер разрешил звук.</div>
      </div>
    </div>
  );
}

// иконки — PNG из src/img/icons, читаются до первого рендера
// ?preview=1 — только предпросмотр интро для админки, без игры
void loadIcons().then(() => render(getParam('preview') ? <IntroPreview /> : <Boot />, document.getElementById('app')!));
