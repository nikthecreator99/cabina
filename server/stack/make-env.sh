#!/bin/sh
# CABINA: создать секреты сервера в /opt/cabina/.env (один раз, при установке).
#
# Пароль базы и секрет токенов (JWT_SECRET) — случайные, их не знает никто, в том числе Никита и Claude:
# они нужны только программам на этом сервере. Файл .env читает только root (chmod 600), в git он не попадает.
# Из JWT_SECRET подписывается публичный ключ приложения (ANON_KEY, роль anon) — он не секрет, его видит каждый
# браузер; скрипт печатает только его, чтобы вписать в js/auth.js. Ключ service_role не создаём: он не нужен.
set -eu
umask 077
ENV=${CABINA_ENV:-/opt/cabina/.env}

[ -e "$ENV" ] && { echo "$ENV уже есть — не трогаю (секреты меняются только вместе с выпуском приложения)" >&2; exit 1; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
now=$(date +%s)
exp=$((now + 10 * 365 * 24 * 3600))     # 10 лет: ключ меняется только новым выпуском приложения

head=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
body=$(printf '{"role":"anon","iss":"supabase","iat":%s,"exp":%s}' "$now" "$exp" | b64url)
sig=$(printf '%s' "$head.$body" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
ANON_KEY="$head.$body.$sig"

cat > "$ENV" <<EOF
# CABINA, секреты сервера. Создано $(date -u +%Y-%m-%dT%H:%MZ) скриптом make-env.sh. Никому не показывать.
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
# почта для кодов — задаётся скриптом set-mail.sh
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
EOF
chmod 600 "$ENV"
echo "готово: $ENV (только для root)"
echo "публичный ключ приложения (ANON_KEY, не секрет):"
echo "$ANON_KEY"
