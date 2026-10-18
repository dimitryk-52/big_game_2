// Хранилище данных: вопросы, настройки, снапшоты игры.
// supabase — таблицы questions и kv; ws(dev) — файлы через /devstore; local — localStorage.
import type { Question, Settings } from './types';
import { mergeSettings } from './settings';
import { netMode, supabase } from './net';
import { SEED_QUESTIONS } from './seedQuestions';

export interface DataStore {
  kind: string;
  loadQuestions(): Promise<Question[]>;
  saveQuestions(qs: Question[]): Promise<void>;
  deleteQuestion(id: string): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  loadSnapshot(room: string): Promise<any | null>;
  saveSnapshot(room: string, data: any): Promise<void>;
  uploadImage(file: File): Promise<string>;
}

abstract class KvStore implements DataStore {
  abstract kind: string;
  protected abstract get(key: string): Promise<any>;
  protected abstract put(key: string, val: any): Promise<void>;
  async loadQuestions() {
    const q = await this.get('questions');
    return (q as Question[] | null) ?? SEED_QUESTIONS;
  }
  async saveQuestions(qs: Question[]) {
    const all = await this.loadQuestions();
    const map = new Map(all.map((q) => [q.id, q]));
    qs.forEach((q) => map.set(q.id, q));
    await this.put('questions', [...map.values()]);
  }
  async deleteQuestion(id: string) {
    const all = await this.loadQuestions();
    await this.put('questions', all.filter((q) => q.id !== id));
  }
  async loadSettings() {
    return mergeSettings(await this.get('settings'));
  }
  async saveSettings(s: Settings) {
    await this.put('settings', s);
  }
  async loadSnapshot(room: string) {
    return this.get('game_' + room);
  }
  async saveSnapshot(room: string, data: any) {
    await this.put('game_' + room, data);
  }
  async uploadImage(file: File) {
    return fileToDataUrl(file);
  }
}

class LocalStore extends KvStore {
  kind = 'localStorage (только этот браузер)';
  protected async get(key: string) {
    try {
      const v = localStorage.getItem('bg_' + key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }
  protected async put(key: string, val: any) {
    localStorage.setItem('bg_' + key, JSON.stringify(val));
  }
}

class DevStore extends KvStore {
  kind = 'dev-сервер (.devdata)';
  protected async get(key: string) {
    const r = await fetch('/devstore/' + encodeURIComponent(key));
    return r.ok ? r.json() : null;
  }
  protected async put(key: string, val: any) {
    await fetch('/devstore/' + encodeURIComponent(key), { method: 'PUT', body: JSON.stringify(val) });
  }
}

class SupabaseStore implements DataStore {
  kind = 'Supabase';
  private sb = supabase()!;
  async loadQuestions() {
    const { data, error } = await this.sb.from('questions').select('id,data');
    if (error) throw error;
    if (!data.length) return SEED_QUESTIONS;
    return data.map((r: any) => ({ ...r.data, id: r.id }));
  }
  async saveQuestions(qs: Question[]) {
    for (let i = 0; i < qs.length; i += 200) {
      const chunk = qs.slice(i, i + 200).map((q) => ({ id: q.id, data: q, updated_at: new Date().toISOString() }));
      const { error } = await this.sb.from('questions').upsert(chunk);
      if (error) throw error;
    }
  }
  async deleteQuestion(id: string) {
    const { error } = await this.sb.from('questions').delete().eq('id', id);
    if (error) throw error;
  }
  private async get(key: string) {
    const { data, error } = await this.sb.from('kv').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  }
  private async put(key: string, value: any) {
    const { error } = await this.sb.from('kv').upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
  async loadSettings() {
    return mergeSettings(await this.get('settings'));
  }
  async saveSettings(s: Settings) {
    await this.put('settings', s);
  }
  async loadSnapshot(room: string) {
    return this.get('game_' + room);
  }
  async saveSnapshot(room: string, data: any) {
    await this.put('game_' + room, data);
  }
  async uploadImage(file: File) {
    const blob = await resizeImage(file, 900);
    const path = `img/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const { error } = await this.sb.storage.from('media').upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw error;
    return this.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
  }
}

async function resizeImage(file: File, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/webp', 0.82));
}

async function fileToDataUrl(file: File): Promise<string> {
  const blob = await resizeImage(file, 600);
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(blob);
  });
}

let store: DataStore | null = null;
export function getStore(): DataStore {
  if (store) return store;
  const mode = netMode();
  store = mode === 'supabase' && supabase() ? new SupabaseStore() : mode === 'ws' ? new DevStore() : new LocalStore();
  return store;
}
