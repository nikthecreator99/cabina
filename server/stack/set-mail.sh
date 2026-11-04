#!/bin/sh
# CABINA: подключить почту, с которой уходят письма с кодами (регистрация, новый пароль).
# Спрашивает сервер почты, порт, логин и пароль и записывает их в /opt/cabina/.env.
# С 04.11.2026 — почтовый сервис Селектела: сервер smtp.mail.selcloud.ru, порт 1126, логин — число из панели
# («Login»), пароль — «Pass (API-key)». Отправитель — noreply@cabina-app.ru (SMTP_FROM в docker-compose.yml).
# Пароль вводится здесь, на сервере, и на экране не виден; в чат и в git его не присылать.
set -eu
umask 077
ENV=${CABINA_ENV:-/opt/cabina/.env}
[ -w "$ENV" ] || { echo "нет $ENV — сначала make-env.sh" >&2; exit 1; }

printf 'Сервер почты [smtp.mail.selcloud.ru]: '; read -r host; host=${host:-smtp.mail.selcloud.ru}
printf 'Порт [1126]: '; read -r port; port=${port:-1126}
printf 'Логин (у Селектела — число из строки Login): '; read -r user
printf 'Пароль (Pass / API-key; не виден при вводе): '; stty -echo; read -r pass; stty echo; echo

case "$host$port$user" in *[!A-Za-z0-9.@_+-]*) echo "в сервере, порту или логине лишние символы" >&2; exit 1;; esac
case "$pass" in "") echo "пустой пароль" >&2; exit 1;; *"'"*) echo "в пароле не должно быть знака ' — выпустите другой пароль" >&2; exit 1;; esac

tmp=$(mktemp "$ENV.XXXXXX")
grep -v '^SMTP_' "$ENV" > "$tmp" || true
{
  echo "SMTP_HOST=$host"
  echo "SMTP_PORT=$port"
  echo "SMTP_USER=$user"
  # одинарные кавычки: Docker Compose не трогает $ и другие знаки внутри
  printf "SMTP_PASS='%s'\n" "$pass"
} >> "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$ENV"
unset pass
echo "записано. Применить: cd /opt/cabina && docker compose up -d auth"
