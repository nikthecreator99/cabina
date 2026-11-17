#!/bin/sh
# CABINA: свои пароли базы у входа (GoTrue, роль supabase_auth_admin) и у PostgREST (роль authenticator).
#
# До 15.11.2026 у обеих ролей был главный пароль базы (POSTGRES_PASSWORD). Наружу база не открыта, но с разными
# паролями утечка одного (например, из настроек одной программы) не открывает остальные (аудит 14.11.2026).
#
# Что делает: если в /opt/cabina/.env нет AUTH_DB_PASSWORD или AUTHENTICATOR_PASSWORD — дописывает случайные,
# затем ставит их ролям в базе. Пароли никто не видит и не вводит: они нужны только программам на сервере.
# Повторный запуск безопасен: те же пароли ставятся ещё раз. После него вход и PostgREST надо перезапустить
# (docker compose up -d auth rest) — это делает upgrade-2026-11.sh, при установке — шаг 4 в README.
#   sh db-passwords.sh          — поставить пароли из .env
#   sh db-passwords.sh --old    — вернуть ролям главный пароль (откат)
set -eu
umask 077
ENV=${CABINA_ENV:-/opt/cabina/.env}
# как попасть в базу; в автотесте — свой psql
PSQL=${CABINA_PSQL:-docker exec -i supabase-db psql -d postgres -v ON_ERROR_STOP=1 -q -X}
[ -w "$ENV" ] || { echo "нет $ENV — сначала make-env.sh" >&2; exit 1; }

val() { sed -n "s/^$1=//p" "$ENV" | tail -n 1; }

if [ "${1:-}" = "--old" ]; then
  auth=$(val POSTGRES_PASSWORD); rest=$auth
else
  for v in AUTH_DB_PASSWORD AUTHENTICATOR_PASSWORD; do
    [ -n "$(val $v)" ] || echo "$v=$(openssl rand -hex 32)" >> "$ENV"
  done
  chmod 600 "$ENV"
  auth=$(val AUTH_DB_PASSWORD); rest=$(val AUTHENTICATOR_PASSWORD)
fi
# пароль идёт внутрь SQL-строки: только буквы и цифры, иначе не ставим
for p in "$auth" "$rest"; do
  case "$p" in ''|*[!A-Za-z0-9]*) echo "пароль в $ENV пустой или с лишними знаками — не ставлю" >&2; exit 1 ;; esac
done

# Пароль — через ввод psql, а не в строке команды (её видно в списке процессов); запись команд в журнал базы
# на это время выключена. Сначала от supabase_admin (главная роль образа Supabase), не вышло — от postgres.
alter=$(printf "alter role supabase_auth_admin with password '%s';\nalter role authenticator with password '%s';\n" "$auth" "$rest")
if printf "set log_statement = 'none';\n%s\n" "$alter" | $PSQL -U supabase_admin 2>/dev/null; then :
elif printf '%s\n' "$alter" | $PSQL -U postgres; then :
else echo "не получилось поменять пароли в базе — ничего не изменено" >&2; exit 1
fi
echo "пароли ролей supabase_auth_admin и authenticator поставлены${1:+ (главный пароль — откат)}"
