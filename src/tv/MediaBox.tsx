import { useEffect, useState } from 'preact/hooks';
import type { Question } from '../shared/types';
import { PixIcon } from '../ui/common';
import { mediaCount, missingMedia, onMediaChange, refreshMedia } from './localMedia';

/** Статус папки media/: сколько файлов и каких из вопросов не хватает */
export function MediaBox({ questions, compact }: { questions: Question[] | null; compact?: boolean }) {
  const [, force] = useState(0);
  useEffect(() => onMediaChange(() => force((x) => x + 1)), []);
  const count = mediaCount();
  const missing = questions ? missingMedia(questions) : [];
  const label = count === null ? 'медиа: нет сервера' : `медиа: ${count}`;
  if (compact) {
    return (
      <span
        class="chip"
        style={{ cursor: 'pointer' }}
        title={(missing.length ? 'Нет в папке media: ' + missing.join(', ') : 'Папка media в проекте') + ' · клик — обновить'}
        onClick={() => void refreshMedia()}
      >
        <PixIcon id="ui_film" size={16} /> {label}
        {missing.length > 0 && <b style={{ color: 'var(--red)' }}> · нет {missing.length}</b>}
      </span>
    );
  }
  if (count === null) return null;
  return (
    <div class="media-box">
      <div><PixIcon id="ui_film" size={16} /> Папка <b>media</b>: {count} файлов</div>
      {missing.length > 0 && (
        <div class="warn" style={{ fontSize: 13, textAlign: 'left' }}>
          В папке media нет файлов из вопросов ({missing.length}): {missing.slice(0, 8).join(', ')}{missing.length > 8 ? '…' : ''}
        </div>
      )}
    </div>
  );
}
