import { useEffect, useState } from 'preact/hooks';
import type { Question } from '../shared/types';
import { canRememberFolder, mediaInfo, missingMedia, onMediaChange, pickFolder, restoreFolder } from './localMedia';

export function useMedia() {
  const [, force] = useState(0);
  useEffect(() => onMediaChange(() => force((x) => x + 1)), []);
  return mediaInfo();
}

/** Блок «папка с медиа»: статус, выбор, список ненайденных файлов */
export function MediaBox({ questions, compact }: { questions: Question[] | null; compact?: boolean }) {
  const info = useMedia();
  const [state, setState] = useState<'idle' | 'need-click' | 'busy'>('idle');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (info.count) return;
    restoreFolder(false).then((r) => r === 'need-click' && setState('need-click'));
  }, []);
  const missing = questions ? missingMedia(questions) : [];
  const pick = async () => {
    setErr('');
    setState('busy');
    try {
      const r = state === 'need-click' ? await restoreFolder(true) : 'none';
      if (r !== 'ok') await pickFolder();
    } catch (e: any) {
      if (e?.name !== 'AbortError') setErr(String(e?.message ?? e));
    }
    setState('idle');
  };
  if (compact) {
    return (
      <span class="chip" title={missing.length ? 'Нет файлов: ' + missing.join(', ') : info.folder}>
        🎬 {info.count ? `${info.count} файлов` : 'медиа не выбраны'}
        {missing.length > 0 && <b style={{ color: 'var(--red)' }}> · нет {missing.length}</b>}
        <button class="btn small ghost" style={{ padding: '0 6px', boxShadow: 'none', border: 'none' }} onClick={pick}>📁</button>
      </span>
    );
  }
  return (
    <div class="media-box">
      <div>
        🎬 Медиа для вопросов:{' '}
        {info.count ? <b>{info.folder} — {info.count} файлов</b> : <span class="muted">папка не выбрана</span>}
      </div>
      <button class="btn small" disabled={state === 'busy'} onClick={pick}>
        {state === 'need-click' ? '🔓 Разрешить доступ к папке' : info.count ? '📁 Сменить папку' : '📁 Выбрать папку с медиа'}
      </button>
      {missing.length > 0 && (
        <div class="warn" style={{ fontSize: 13, textAlign: 'left' }}>
          Не найдены в папке ({missing.length}): {missing.slice(0, 8).join(', ')}{missing.length > 8 ? '…' : ''}
        </div>
      )}
      {!canRememberFolder && <div class="muted" style={{ fontSize: 12 }}>Этот браузер не запоминает папку — выбирай при каждом запуске (в Chrome/Edge запоминается).</div>}
      {err && <div class="warn" style={{ fontSize: 13 }}>{err}</div>}
    </div>
  );
}
