-- CABINA, сервер, шаг 15: CABINA AI — справочный помощник по открытым документам (решение Никиты 14.11.2026).
--
-- Нейросеть не обучаем. Документы режем на куски (пункт, статья), куски с «отпечатками смысла» (эмбеддинги Яндекса,
-- 256 чисел) лежат здесь. На вопрос сервер помощника (server/ai) находит подходящие куски и просит YandexGPT ответить
-- только по ним, со ссылкой на документ и пункт.
--
-- Что хранится:
--   private.ai_docs   — документы: название, редакция, откуда взят (открытые акты; ДСП — никогда);
--   private.ai_chunks — куски документов, текстовый индекс по-русски и эмбеддинг;
--   private.limits    — плюс счётчик вопросов человека за день (стирается через сутки, как остальные счётчики);
--   private.ai_daily  — сколько вопросов задано за день всеми вместе (одно число, без людей) — общий потолок расходов.
-- Самих вопросов и ответов сервер не хранит.
--
-- Режим (private.config 'ai_mode'): 'off' — выключено, 'admin' — только администратор (этап 2, по умолчанию),
-- 'members' — все с аккаунтом (этап 4, только после изменения уведомления в Роскомнадзор и новой редакции согласия).
--
-- Можно применять в любой момент: приложение без CABINA AI эти функции не вызывает.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

insert into private.config (key, value) values
  ('ai_mode', 'admin'),
  ('ai_per_day', '10'),          -- вопросов в день на человека
  ('ai_admin_per_day', '100'),   -- у администратора — для проверки качества
  ('ai_all_per_day', '300')      -- всего за день на весь сервер (≈ 750 ₽ в худший день)
  on conflict (key) do nothing;

-- ---------------------------------------------------------------- документы

create table private.ai_docs (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  title text not null check (length(title) between 2 and 200),   -- «Трудовой кодекс РФ»
  edition text not null check (length(edition) between 4 and 100),  -- «ред. от 01.09.2026»
  source text not null check (source ~ '^https://' and length(source) <= 500),
  loaded_at timestamptz not null default now()
);

create table private.ai_chunks (
  id bigserial primary key,
  doc_id text not null references private.ai_docs (id) on delete cascade,
  ref text not null check (length(ref) between 1 and 200),        -- «статья 115», «пункт 14»
  body text not null check (length(body) between 1 and 4000),
  tsv tsvector generated always as (to_tsvector('russian', ref || ' ' || body)) stored,
  emb extensions.vector(256) not null
);
create index ai_chunks_tsv on private.ai_chunks using gin (tsv);
create index ai_chunks_doc on private.ai_chunks (doc_id);
-- кусков — тысячи: точный перебор по эмбеддингам быстрее и честнее приближённого индекса, индекс не нужен

alter table private.ai_docs enable row level security;
alter table private.ai_chunks enable row level security;
revoke all on private.ai_docs, private.ai_chunks from public, anon, authenticated;

-- ---------------------------------------------------------------- счётчики

alter table private.limits add column ai_questions integer not null default 0;

create table private.ai_daily (
  day date primary key,
  n integer not null default 0
);
alter table private.ai_daily enable row level security;
revoke all on private.ai_daily from public, anon, authenticated;

-- Можно ли этому человеку пользоваться CABINA AI сейчас
create function private.ai_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and case private.conf('ai_mode')
    when 'admin' then private.is_admin()
    when 'members' then exists (select 1 from public.profiles where id = auth.uid())
    else false end
$$;

-- Перед каждым вопросом: проверка доступа и лимитов, счётчик +1. Ответ — сколько вопросов осталось сегодня.
create function public.ai_begin() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  mine integer;
  per_day integer := case when private.is_admin() then private.conf('ai_admin_per_day')::int else private.conf('ai_per_day')::int end;
  total integer;
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if not private.ai_allowed() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  insert into private.ai_daily (day) values (private.today()) on conflict do nothing;
  update private.ai_daily d set n = d.n + 1 where d.day = private.today() returning d.n into total;
  if total > private.conf('ai_all_per_day')::int then raise exception 'cabina: ai busy' using errcode = 'P0001'; end if;
  insert into private.limits (user_id, day) values (auth.uid(), private.today()) on conflict do nothing;
  update private.limits set ai_questions = ai_questions + 1 where user_id = auth.uid() and day = private.today()
    returning ai_questions into mine;
  if mine > per_day then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  return jsonb_build_object('left', per_day - mine);
end $$;

-- Сколько вопросов осталось сегодня (без траты) — для экрана
create function public.ai_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not private.ai_allowed() then jsonb_build_object('on', false)
    else jsonb_build_object('on', true,
      'left', greatest(0, case when private.is_admin() then private.conf('ai_admin_per_day')::int else private.conf('ai_per_day')::int end
        - coalesce((select ai_questions from private.limits where user_id = auth.uid() and day = private.today()), 0)),
      'docs', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'edition', edition) order by title)
                        from private.ai_docs), '[]'::jsonb))
  end
$$;

-- ---------------------------------------------------------------- поиск

-- Поиск кусков: по смыслу (эмбеддинг вопроса) и по словам (русский текстовый поиск), результаты склеиваются
-- (reciprocal rank fusion). Тексты документов открытые, но поиск — только тем, кому CABINA AI сейчас разрешён.
create function public.ai_search(p_query text, p_emb real[], p_limit integer default 6)
returns table (doc text, title text, edition text, source text, ref text, body text, score double precision)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := left(coalesce(p_query, ''), 500);
  e extensions.vector(256);
begin
  if not private.ai_allowed() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  if p_emb is null or array_length(p_emb, 1) <> 256 then raise exception 'cabina: bad embedding' using errcode = 'P0001'; end if;
  e := p_emb::extensions.vector(256);
  return query
  with sem as (
    select c.id, row_number() over (order by c.emb operator(extensions.<=>) e) r
    from private.ai_chunks c order by c.emb operator(extensions.<=>) e limit 20
  ), words as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, w) desc) r
    from private.ai_chunks c, websearch_to_tsquery('russian', q) w
    where c.tsv @@ w order by ts_rank_cd(c.tsv, w) desc limit 20
  ), fused as (
    select id, sum(1.0 / (60 + r)) s from (select * from sem union all select * from words) x group by id
  )
  select d.id, d.title, d.edition, d.source, c.ref, c.body, f.s::double precision
  from fused f join private.ai_chunks c on c.id = f.id join private.ai_docs d on d.id = c.doc_id
  order by f.s desc limit least(greatest(coalesce(p_limit, 6), 1), 10);
end $$;

-- ---------------------------------------------------------------- права на функции

revoke all on function private.ai_allowed() from public, anon, authenticated;
revoke all on function public.ai_begin(), public.ai_status(), public.ai_search(text, real[], integer) from public, anon;
grant execute on function public.ai_begin(), public.ai_status(), public.ai_search(text, real[], integer) to authenticated;

notify pgrst, 'reload schema';
