-- Схема базы для Big Game 2. Выполни в Supabase: SQL Editor → New query → Run.
-- Авторизации нет (игра для друзей), поэтому доступ открыт для anon-ключа.
-- Не храни здесь ничего секретного.

create table if not exists public.questions (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- настройки (key = 'settings') и снапшоты игр (key = 'game_<КОМНАТА>')
create table if not exists public.kv (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

alter table public.questions enable row level security;
alter table public.kv enable row level security;

drop policy if exists "anon all questions" on public.questions;
create policy "anon all questions" on public.questions for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all kv" on public.kv;
create policy "anon all kv" on public.kv for all to anon, authenticated using (true) with check (true);

-- Хранилище картинок для вопросов (публичное чтение, загрузка anon-ключом)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select to anon, authenticated using (bucket_id = 'media');

drop policy if exists "media anon upload" on storage.objects;
create policy "media anon upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'media');

-- Уборка старых снапшотов (по желанию, запускать вручную):
-- delete from public.kv where key like 'game_%' and updated_at < now() - interval '30 days';
