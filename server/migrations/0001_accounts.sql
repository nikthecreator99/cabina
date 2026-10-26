-- CABINA, сервер, шаг 1: аккаунты, согласие, приглашения, статистика.
--
-- Что хранится на сервере (и больше ничего):
--   auth.users          — почта и «отпечаток» пароля (это встроенный вход Supabase, мы его не трогаем);
--   public.profiles     — роль, дата регистрации, дата последнего захода (без времени), платформа и версия;
--   public.consents     — какой документ и в какой редакции человек принял и когда;
--   private.invites     — коды-приглашения (хранится только хеш кода);
--   private.stats_daily — числа за день: сколько зарегистрировалось, подтвердило почту, удалило аккаунт.
-- Поездки, заработок, отвлечения, профиль из телефона сюда не попадают.
--
-- Правила:
--   * на каждой таблице в public включён RLS, по умолчанию запрещено всё;
--   * менять данные приложение может только через функции ниже (rpc), прямой записи в таблицы нет;
--   * всё, что связано с аккаунтом, удаляется вместе с ним (on delete cascade);
--   * схема private не видна через API.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- настройки

create table private.config (
  key text primary key,
  value text not null
);

insert into private.config (key, value) values
  ('invite_only', 'true'),        -- регистрация только по приглашению (закрытое испытание)
  ('consent_version', 'privacy-1'), -- текущая редакция согласия; при смене просим согласие заново
  ('log_days', '30');             -- сколько дней хранить IP-адреса в журналах входа

create function private.conf(k text) returns text
language sql stable security definer set search_path = '' as $$
  select value from private.config where key = k
$$;

-- «Сегодня» по Москве: статистика и даты заходов считаются в московских сутках.
create function private.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Moscow')::date
$$;

-- ---------------------------------------------------------------- таблицы

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_on date not null default private.today(),
  last_seen date,
  platform text check (platform in ('web', 'android', 'ios')),
  app_version text check (app_version ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$')
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document ~ '^[a-z]+-\d+$'),
  given_at timestamptz not null default now()
);
create index consents_user on public.consents (user_id);

create table private.invites (
  code_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

create table private.stats_daily (
  day date not null,
  metric text not null check (metric in ('signup', 'confirmed', 'deleted')),
  platform text not null default '',
  value integer not null default 0,
  primary key (day, metric, platform)
);

alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table private.config enable row level security;
alter table private.invites enable row level security;
alter table private.stats_daily enable row level security;

-- Человек видит только свои строки. Писать напрямую нельзя никому из приложения.
create policy "свой профиль" on public.profiles for select to authenticated using (id = auth.uid());
create policy "свои согласия" on public.consents for select to authenticated using (user_id = auth.uid());

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
grant select on public.profiles, public.consents to authenticated;

-- ---------------------------------------------------------------- служебное

create function private.hash_code(code text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(upper(btrim(code)), 'UTF8')), 'hex')
$$;

create function private.bump(m text, p text) returns void
language sql security definer set search_path = '' as $$
  insert into private.stats_daily (day, metric, platform, value)
  values (private.today(), m, coalesce(p, ''), 1)
  on conflict (day, metric, platform) do update set value = private.stats_daily.value + 1
$$;

-- ---------------------------------------------------------------- регистрация

-- Срабатывает, когда встроенный вход Supabase создаёт аккаунт. Приложение передаёт в signUp
-- options.data = { consent: 'privacy-1', invite: 'КОД', platform: 'web', version: '2.8.0' }.
-- Без принятого согласия текущей редакции или (в закрытом режиме) без живого приглашения
-- аккаунт не создаётся: ошибка здесь отменяет регистрацию целиком.
create function private.on_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  p text := meta ->> 'platform';
  v text := meta ->> 'version';
  inv text;
begin
  if meta ->> 'consent' is distinct from private.conf('consent_version') then
    raise exception 'cabina: consent required' using errcode = 'P0001';
  end if;

  if private.conf('invite_only') = 'true' then
    update private.invites set used_at = now(), used_by = new.id
      where code_hash = private.hash_code(coalesce(meta ->> 'invite', ''))
        and used_at is null and expires_at > now()
      returning code_hash into inv;
    if inv is null then
      raise exception 'cabina: invite required' using errcode = 'P0001';
    end if;
  end if;

  if p not in ('web', 'android', 'ios') then p := null; end if;
  if v !~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$' then v := null; end if;

  insert into public.profiles (id, last_seen, platform, app_version)
    values (new.id, private.today(), p, v);
  insert into public.consents (user_id, document) values (new.id, meta ->> 'consent');
  perform private.bump('signup', p);

  -- Код приглашения и прочее из регистрации в аккаунте не храним.
  update auth.users set raw_user_meta_data = '{}'::jsonb where id = new.id;
  return null;
end $$;

create trigger cabina_user_created after insert on auth.users
  for each row execute function private.on_user_created();

create function private.on_user_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump('confirmed', (select platform from public.profiles where id = new.id));
  return null;
end $$;

-- Позже приложение (или кто угодно со своим ключом) может записать в user_metadata что угодно.
-- Нам эти данные не нужны, поэтому они просто не сохраняются.
create function private.no_user_metadata() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.raw_user_meta_data := '{}'::jsonb;
  return new;
end $$;

create trigger cabina_no_user_metadata before update of raw_user_meta_data on auth.users
  for each row when (new.raw_user_meta_data is distinct from '{}'::jsonb)
  execute function private.no_user_metadata();

create trigger cabina_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.on_user_confirmed();

create function private.on_user_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump('deleted', '');
  return null;
end $$;

create trigger cabina_user_deleted after delete on auth.users
  for each row execute function private.on_user_deleted();

-- ---------------------------------------------------------------- для приложения (rpc)

-- Отметка «заходил сегодня»: только дата, платформа и версия приложения.
create function public.touch(p_platform text, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  update public.profiles set
    last_seen = private.today(),
    platform = case when p_platform in ('web', 'android', 'ios') then p_platform else platform end,
    app_version = case when p_version ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$' then p_version else app_version end
  where id = auth.uid();
end $$;

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14: право знать свои данные).
create function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', u.email,
    'email_confirmed', u.email_confirmed_at is not null,
    'created_on', p.created_on,
    'last_seen', p.last_seen,
    'platform', p.platform,
    'app_version', p.app_version,
    'consents', coalesce((select jsonb_agg(jsonb_build_object('document', c.document, 'given_at', c.given_at) order by c.given_at)
                          from public.consents c where c.user_id = u.id), '[]'::jsonb)
  )
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;

-- Удаление аккаунта = отзыв согласия. Стирается всё сразу; из резервных копий — по их сроку (14 дней).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- для администратора

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Статистика: только числа, без почты и идентификаторов.
create function public.admin_stats() returns jsonb
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
    'daily', coalesce((select jsonb_agg(d order by d ->> 'day') from (
        select jsonb_build_object('day', day,
          'signup', sum(value) filter (where metric = 'signup'),
          'confirmed', sum(value) filter (where metric = 'confirmed'),
          'deleted', sum(value) filter (where metric = 'deleted')) d
        from private.stats_daily where day > t - 90 group by day) s), '[]'::jsonb)
  );
end $$;

-- Новое приглашение: код показывается один раз, на сервере остаётся только его хеш.
create function public.admin_create_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if not private.is_admin() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  insert into private.invites (code_hash) values (private.hash_code(code));
  return code;
end $$;

-- ---------------------------------------------------------------- журналы

-- IP-адреса в журналах входа храним не дольше log_days (по умолчанию 30 дней).
-- На сервере вызывается раз в сутки через pg_cron (см. server/README.md).
create function private.cleanup_logs() returns void
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
end $$;

-- ---------------------------------------------------------------- права на функции

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.touch(text, text), public.export_my_data(), public.delete_my_account(),
  public.admin_stats(), public.admin_create_invite() from public, anon;
grant execute on function public.touch(text, text), public.export_my_data(), public.delete_my_account(),
  public.admin_stats(), public.admin_create_invite() to authenticated;
