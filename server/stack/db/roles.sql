-- CABINA: пароли служебных ролей базы при первом запуске (из POSTGRES_PASSWORD в /opt/cabina/.env).
-- authenticator — PostgREST, supabase_auth_admin — вход (GoTrue). Других служб Supabase у нас нет.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
