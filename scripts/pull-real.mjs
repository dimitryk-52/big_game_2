// Скачать боевые настройки и вопросы из Supabase в .devdata (только чтение): node scripts/pull-real.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^\s*VITE_/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const q = await sb.from('questions').select('id,data');
if (q.error) throw q.error;
const s = await sb.from('kv').select('key,value,updated_at');
if (s.error) throw s.error;
fs.mkdirSync('.devdata', { recursive: true });
fs.writeFileSync('.devdata/real_questions.json', JSON.stringify(q.data.map((r) => ({ ...r.data, id: r.id }))));
const settings = s.data.find((r) => r.key === 'settings');
fs.writeFileSync('.devdata/real_settings.json', JSON.stringify(settings?.value ?? null));
console.log('вопросов', q.data.length, 'kv:', s.data.map((r) => `${r.key} (${r.updated_at}, ${JSON.stringify(r.value).length} б)`).join('; '));
