// Треки ритм-игры: отрывки трёх песен и ноты под них. Ноты сняты с голоса (где он есть) —
// голос отделён от музыки, слоги найдены по атакам и притянуты к сетке долей; дорожка идёт за высотой
// голоса (выше — правее). Без голоса — по ведущей мелодии. Файлы отрывков — music/rhythm/ (только локально).
// Ноты собраны скриптом анализа; руками их не правим — перегенерировать.
import type { RhythmPublic } from '../shared/types';
import { RHYTHM_LEAD_BEATS, rhythmChart } from './logic';
import { RHYTHM_DATA } from './rhythmData';

export interface RhythmTrack {
  id: string;
  name: string;
  /** отрывок — mp3 в music/rhythm/ */
  file: string;
  bpm: number;
  /** длина отрывка, мс */
  dur: number;
  /** ноты: [мс от начала отрывка, дорожка 0..3] */
  notes: [number, number][];
}

export const RHYTHM_TRACKS: RhythmTrack[] = RHYTHM_DATA;

export interface RhythmNoteAt { at: number; lane: number }

/** ноты батла (мс от startAt), длина и момент начала отсчёта 4-3-2-1 */
export function rhythmNotes(r: Pick<RhythmPublic, 'seed' | 'bpm' | 'beats' | 'track'>): { notes: RhythmNoteAt[]; dur: number; countAt: number } {
  const msPerBeat = 60000 / r.bpm;
  const tr = r.track != null ? RHYTHM_TRACKS[r.track] : null;
  if (tr) {
    const notes = tr.notes.map(([at, lane]) => ({ at, lane }));
    const first = notes[0]?.at ?? 0;
    return { notes, dur: tr.dur, countAt: Math.max(0, first - RHYTHM_LEAD_BEATS * msPerBeat) };
  }
  return { notes: rhythmChart(r.seed, r.beats).map((n) => ({ at: n.beat * msPerBeat, lane: n.lane })), dur: r.beats * msPerBeat, countAt: 0 };
}
