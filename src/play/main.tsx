import { render } from 'preact';
import { useState } from 'preact/hooks';
import '../styles/base.css';
import '../styles/play.css';
import { GameClient } from '../shared/client';
import { PlayApp } from './PlayApp';
import { getParam } from '../shared/util';

function RoomGate() {
  const [room, setRoom] = useState<string | null>(() => getParam('room') ?? localStorage.getItem('bg_last_room'));
  const [input, setInput] = useState('');
  const [client, setClient] = useState<GameClient | null>(null);
  if (room && !client) {
    localStorage.setItem('bg_last_room', room);
    const c = new GameClient(room.toUpperCase());
    c.start();
    setClient(c);
  }
  if (client) return <PlayApp client={client} onLeaveRoom={() => { localStorage.removeItem('bg_last_room'); location.href = location.pathname; }} />;
  return (
    <div class="phone center-screen">
      <div class="panel col" style={{ width: '100%' }}>
        <h2 style={{ margin: 0 }}>BIG GAME 2</h2>
        <div class="muted">Введи код комнаты с экрана ТВ</div>
        <input class="inp big" maxLength={4} value={input} onInput={(e) => setInput((e.target as HTMLInputElement).value.toUpperCase())} placeholder="ABCD" />
        <button class="btn primary" disabled={input.length !== 4} onClick={() => setRoom(input)}>Войти</button>
      </div>
    </div>
  );
}

render(<RoomGate />, document.getElementById('app')!);
