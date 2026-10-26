-- Упрощённая копия того, что Supabase создаёт сам: роли, схема auth, auth.uid().
-- Только для автотестов на «стенде». На настоящем сервере этот файл не применяется.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz default now(),
  last_sign_in_at timestamptz
);

create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  ip inet,
  user_agent text
);

create table auth.audit_log_entries (
  id uuid primary key default gen_random_uuid(),
  payload json,
  created_at timestamptz default now(),
  ip_address varchar(64) default ''
);

-- Так же, как в Supabase: id пользователя берётся из проверенного токена входа.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

grant all on all tables in schema auth to supabase_auth_admin;
grant usage on schema auth to supabase_auth_admin;

-- Supabase по умолчанию даёт anon и authenticated полный доступ к новым таблицам в public.
-- Повторяем это, чтобы тесты ловили таблицы, которые защищены только «по забывчивости».
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
