// Проверка подключения к Supabase: таблицы, запись, Realtime Broadcast (WS и REST).
// Запуск: npm run check:supabase  (берёт ключи из .env)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^\s*VITE_/.test(l)).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('✘ В .env нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(1); }
const sb = createClient(url, key);
let ok = true;
const step = async (name, fn) => {
  try { const r = await fn(); console.log('✔', name, r ?? ''); } catch (e) { ok = false; console.log('✘', name, '—', e.message ?? e); }
};

await step('таблица questions (чтение)', async () => {
  const { data, error } = await sb.from('questions').select('id').limit(1);
  if (error) throw error;
  return `строк: ${data.length}`;
});
await step('таблица kv (запись/чтение/удаление)', async () => {
  const k = 'healthcheck';
  let { error } = await sb.from('kv').upsert({ key: k, value: { t: Date.now() } });
  if (error) throw error;
  const r = await sb.from('kv').select('value').eq('key', k).single();
  if (r.error) throw r.error;
  ({ error } = await sb.from('kv').delete().eq('key', k));
  if (error) throw error;
});
await step('storage bucket media', async () => {
  const { error } = await sb.storage.from('media').list('', { limit: 1 });
  if (error) throw error;
});
await step('Realtime: подписка + сообщение по WS и по REST', async () => {
  const room = 'bg-healthcheck-' + Math.random().toString(36).slice(2, 7);
  const got = [];
  const sub = sb.channel(room, { config: { broadcast: { self: false } } });
  sub.on('broadcast', { event: 'm' }, ({ payload }) => got.push(payload.via));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('подписка не удалась за 10 c')), 10000);
    sub.subscribe((s) => { if (s === 'SUBSCRIBED') { clearTimeout(t); res(); } else if (s !== 'SUBSCRIBED' && s !== 'CLOSED') { /* ждём */ } });
  });
  const sb2 = createClient(url, key);
  const sender = sb2.channel(room, { config: { broadcast: { self: false } } });
  await sender.httpSend('m', { via: 'rest' });
  await new Promise((res) => sender.subscribe((s) => s === 'SUBSCRIBED' && res()));
  await sender.send({ type: 'broadcast', event: 'm', payload: { via: 'ws' } });
  await new Promise((r) => setTimeout(r, 2000));
  await sb.removeAllChannels();
  await sb2.removeAllChannels();
  if (!got.includes('rest') || !got.includes('ws')) throw new Error('получено: ' + JSON.stringify(got));
  return 'получено: ' + got.join(', ');
});

console.log(ok ? '\nВсё работает.' : '\nЕсть проблемы — см. выше.');
process.exit(ok ? 0 : 1);
