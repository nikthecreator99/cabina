-- CABINA, сервер, шаг 5 (2.20): личные приглашения и «Идеи».
--
-- Что добавляется на сервер:
--   private.invites  — плюс кто создал приглашение (created_by) и номер для отмены (id). Сам код, как и раньше,
--                      хранится только хешем. Пригласивший видит только числа: сколько приглашений ждёт, сколько людей
--                      зарегистрировалось по его приглашениям и сколько из них засчитано (подтвердили почту и заходили
--                      в CABINA в 3 разных дня) — без почты, имён и дат входа приглашённых.
--   public.profiles  — плюс active_days: в сколько разных дней человек заходил (только число, без самих дат).
--   public.ideas     — идеи по улучшению CABINA: текст до 500 знаков, дата, ответ («принята» / «не подошла»).
--                      Идею видят только автор и администратор (администратор — без почты и id автора).
--                      Другим пользователям идеи не показываются: это не переписка между людьми.
--   private.limits   — плюс счётчик идей за день.
-- Новая редакция согласия privacy-3: в ней появились приглашения и идеи. Кто принимал privacy-2, приложение
-- попросит принять новую редакцию; без неё приглашения, идеи и «Коллеги» не работают (private.me()).

update private.config set value = 'privacy-3' where key = 'consent_version';
insert into private.config (key, value) values
  ('invites_open', '10'),   -- сколько неиспользованных приглашений может быть у человека одновременно
  ('invite_days', '14'),    -- сколько дней действует приглашение
  ('invite_active', '3'),   -- приглашённый засчитывается, когда подтвердил почту и заходил в столько разных дней
  ('ideas_per_day', '5'),   -- идей в день от одного человека
  ('idea_keep_days', '365'); -- через сколько дней после ответа идея стирается

-- ---------------------------------------------------------------- таблицы

alter table private.invites add column id uuid not null default gen_random_uuid();
alter table private.invites add column created_by uuid references auth.users (id) on delete cascade;
create unique index invites_id on private.invites (id);
create index invites_by on private.invites (created_by);
create index invites_used_by on private.invites (used_by);

alter table public.profiles add column active_days integer not null default 1 check (active_days >= 1);
alter table private.limits add column ideas integer not null default 0;

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 3 and 500),
  state text not null default 'new' check (state in ('new', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index ideas_user on public.ideas (user_id);

alter table public.ideas enable row level security;
create policy "свои идеи" on public.ideas for select to authenticated using (user_id = auth.uid());
revoke all on public.ideas from anon, authenticated;
grant select on public.ideas to authenticated;

-- ---------------------------------------------------------------- служебное

-- Счётчик за день: как раньше (поиски и предложения), плюс идеи
create or replace function private.spend(u uuid, what text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into private.limits (user_id, day) values (u, private.today()) on conflict do nothing;
  if what = 'search' then
    update private.limits set searches = searches + 1 where user_id = u and day = private.today() returning searches into n;
    if n > private.conf('search_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  elsif what = 'idea' then
    update private.limits set ideas = ideas + 1 where user_id = u and day = private.today() returning ideas into n;
    if n > private.conf('ideas_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  else
    update private.limits set offers = offers + 1 where user_id = u and day = private.today() returning offers into n;
    if n > private.conf('offers_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  end if;
end $$;

-- Сколько приглашённых засчитано: подтвердили почту и заходили в CABINA в invite_active разных дней
create function private.invites_counted(u uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from private.invites i
    join auth.users x on x.id = i.used_by
    join public.profiles p on p.id = i.used_by
  where i.created_by = u and x.email_confirmed_at is not null and p.active_days >= private.conf('invite_active')::int
$$;

-- ---------------------------------------------------------------- для приложения (rpc)

-- Отметка «заходил сегодня»: как раньше, и ещё +1 к числу разных дней (сами даты не хранятся)
create or replace function public.touch(p_platform text, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  update public.profiles set
    active_days = active_days + case when last_seen is distinct from private.today() then 1 else 0 end,
    last_seen = private.today(),
    platform = case when p_platform in ('web', 'android', 'ios') then p_platform else platform end,
    app_version = case when p_version ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$' then p_version else app_version end
  where id = auth.uid();
end $$;

-- Новое личное приглашение. Код показывается один раз, на сервере остаётся только его хеш.
-- Нужны согласие новой редакции и подтверждённая почта; одновременно — не больше invites_open неиспользованных.
create function public.create_invite() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  i uuid;
  e timestamptz;
begin
  if not exists (select 1 from auth.users where id = u and email_confirmed_at is not null) then
    raise exception 'cabina: email not confirmed' using errcode = 'P0001';
  end if;
  if (select count(*) from private.invites where created_by = u and used_at is null and expires_at > now())
     >= private.conf('invites_open')::int then
    raise exception 'cabina: limit' using errcode = 'P0001';
  end if;
  insert into private.invites (code_hash, created_by, expires_at)
    values (private.hash_code(code), u, now() + make_interval(days => private.conf('invite_days')::int))
    returning id, expires_at into i, e;
  return jsonb_build_object('id', i, 'code', code, 'expires_at', e);
end $$;

-- Мои приглашения: ждущие (без кода — он только у меня в телефоне) и числа. Кто именно пришёл — не показываем.
create function public.my_invites() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'open', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'created_at', i.created_at, 'expires_at', i.expires_at) order by i.created_at)
             from private.invites i where i.created_by = u and i.used_at is null and i.expires_at > now()), '[]'::jsonb),
    'joined', (select count(*) from private.invites i where i.created_by = u and i.used_at is not null),
    'counted', private.invites_counted(u),
    'limit', private.conf('invites_open')::int,
    'need_days', private.conf('invite_active')::int
  );
end $$;

-- Отменить своё неиспользованное приглашение
create function public.drop_invite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  delete from private.invites where id = p_id and created_by = auth.uid() and used_at is null;
end $$;

-- Идея: только текст, без служебных символов; не больше ideas_per_day в день
create function public.send_idea(p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  b text := private.clean(p_body, 500);
  i uuid;
begin
  if b is null or char_length(b) < 3 then raise exception 'cabina: empty' using errcode = 'P0001'; end if;
  perform private.spend(u, 'idea');
  insert into public.ideas (user_id, body) values (u, b) returning id into i;
  return i;
end $$;

-- Стереть свою идею (в любой момент, принятую тоже)
create function public.delete_idea(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  delete from public.ideas where id = p_id and user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------- для администратора

-- Идеи — без почты и id автора: чтобы решить, хороша ли идея, знать автора не нужно
create function public.admin_ideas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'body', d.body, 'state', d.state,
      'created_at', d.created_at, 'answered_at', d.answered_at) order by d.state = 'new' desc, d.created_at desc)
    from (select * from public.ideas order by created_at desc limit 300) d), '[]'::jsonb);
end $$;

create function public.admin_answer_idea(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  update public.ideas set state = case when p_accept then 'accepted' else 'declined' end, answered_at = now() where id = p_id;
end $$;

-- Статистика: как раньше, плюс числа по приглашениям и идеям
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t date := private.today();
begin
  if not private.is_admin() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'today', t,
    'total', (select count(*) from public.profiles),
    'confirmed', (select count(*) from auth.users u join public.profiles p on p.id = u.id where u.email_confirmed_at is not null),
    'active_1', (select count(*) from public.profiles where last_seen >= t),
    'active_7', (select count(*) from public.profiles where last_seen > t - 7),
    'active_30', (select count(*) from public.profiles where last_seen > t - 30),
    'platforms', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(platform, 'unknown') k, count(*) n from public.profiles group by 1) s), '{}'::jsonb),
    'versions', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(app_version, 'unknown') k, count(*) n from public.profiles group by 1) s), '{}'::jsonb),
    'invited', (select count(*) from private.invites where created_by is not null and used_at is not null),
    'ideas_new', (select count(*) from public.ideas where state = 'new'),
    'daily', coalesce((select jsonb_agg(d order by d ->> 'day') from (
        select jsonb_build_object('day', day,
          'signup', sum(value) filter (where metric = 'signup'),
          'confirmed', sum(value) filter (where metric = 'confirmed'),
          'deleted', sum(value) filter (where metric = 'deleted')) d
        from private.stats_daily where day > t - 90 group by day) s), '[]'::jsonb)
  );
end $$;

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14): плюс приглашения и идеи
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', u.email,
    'email_confirmed', u.email_confirmed_at is not null,
    'created_on', p.created_on,
    'last_seen', p.last_seen,
    'active_days', p.active_days,
    'platform', p.platform,
    'app_version', p.app_version,
    'consents', coalesce((select jsonb_agg(jsonb_build_object('document', c.document, 'given_at', c.given_at, 'withdrawn_at', c.withdrawn_at)
                          order by c.given_at) from public.consents c where c.user_id = u.id), '[]'::jsonb),
    'invited_by', (select coalesce(i.created_by::text, 'admin') from private.invites i where i.used_by = u.id limit 1),
    'invites', jsonb_build_object(
      'open', coalesce((select jsonb_agg(jsonb_build_object('created_at', i.created_at, 'expires_at', i.expires_at) order by i.created_at)
               from private.invites i where i.created_by = u.id and i.used_at is null), '[]'::jsonb),
      'joined', (select count(*) from private.invites i where i.created_by = u.id and i.used_at is not null),
      'counted', private.invites_counted(u.id)),
    'ideas', coalesce((select jsonb_agg(jsonb_build_object('body', d.body, 'state', d.state, 'created_at', d.created_at, 'answered_at', d.answered_at)
               order by d.created_at) from public.ideas d where d.user_id = u.id), '[]'::jsonb),
    'colleagues_card', (select to_jsonb(c) - 'user_id' from public.cards c where c.user_id = u.id),
    'colleagues_status', (select (to_jsonb(s) - 'user_id' - 'place' - 'dest') || jsonb_build_object('place', sp.place, 'dest', sp.dest)
                          from public.statuses s left join public.status_places sp on sp.user_id = s.user_id where s.user_id = u.id),
    'colleagues', coalesce((select jsonb_agg(jsonb_build_object(
        'with', case when l.from_id = u.id then l.to_id else l.from_id end,
        'state', l.state, 'offered_by_me', l.from_id = u.id, 'created_at', l.created_at, 'answered_at', l.answered_at) order by l.created_at)
      from public.links l where u.id in (l.from_id, l.to_id)), '[]'::jsonb),
    'colleagues_access', coalesce((select jsonb_agg(jsonb_build_object('item', a.item, 'to', coalesce(a.viewer_id::text, 'all')) order by a.item, a.created_at)
      from public.access a where a.user_id = u.id), '[]'::jsonb)
  )
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;

-- ---------------------------------------------------------------- ежедневная очистка

-- Как раньше, плюс: просроченные неиспользованные приглашения и идеи старше idea_keep_days после ответа
create or replace function private.cleanup_logs() returns void
language plpgsql security definer set search_path = '' as $$
declare
  keep interval := make_interval(days => private.conf('log_days')::int);
begin
  delete from auth.audit_log_entries where created_at < now() - keep;
  if exists (select 1 from information_schema.columns
             where table_schema = 'auth' and table_name = 'sessions' and column_name = 'ip') then
    execute 'update auth.sessions set ip = null, user_agent = null where created_at < $1 and (ip is not null or user_agent is not null)'
      using now() - keep;
  end if;

  delete from public.statuses where expires_at <= now();
  delete from public.links where state = 'declined' and answered_at < now() - make_interval(days => private.conf('decline_days')::int);
  delete from public.links where state = 'pending' and created_at < now() - interval '30 days';
  delete from public.statuses s where not exists (
    select 1 from public.links l where l.state = 'accepted' and s.user_id in (l.from_id, l.to_id));
  delete from public.cards c where not c.searchable and c.updated_at < now() - interval '1 day'
    and not exists (select 1 from public.links l where l.state <> 'declined' and c.user_id in (l.from_id, l.to_id));
  delete from private.limits where day < private.today() - 1;

  delete from private.invites where used_at is null and expires_at < now();
  delete from public.ideas where answered_at < now() - make_interval(days => private.conf('idea_keep_days')::int);
end $$;

-- ---------------------------------------------------------------- права на функции

-- Новая служебная функция закрыта от приложения (а private.allowed для правил RLS остаётся доступной, см. шаг 3)
revoke all on function private.invites_counted(uuid) from public, anon, authenticated;
revoke all on function public.create_invite(), public.my_invites(), public.drop_invite(uuid), public.send_idea(text),
  public.delete_idea(uuid), public.admin_ideas(), public.admin_answer_idea(uuid, boolean) from public, anon;
grant execute on function public.create_invite(), public.my_invites(), public.drop_invite(uuid), public.send_idea(text),
  public.delete_idea(uuid), public.admin_ideas(), public.admin_answer_idea(uuid, boolean) to authenticated;
-- touch, admin_stats и export_my_data пересозданы через create or replace — права остались прежними

-- Сервер API (PostgREST) перечитывает список таблиц и функций
notify pgrst, 'reload schema';
