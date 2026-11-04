#!/bin/bash
# Вторая копия: самую свежую ночную копию (уже зашифрованную открытым ключом Никиты, см. cabina-backup.sh)
# отправляет в хранилище другого провайдера в России (любое S3-совместимое). На сервере: /usr/local/bin/cabina-backup-offsite.
# Запускается из cron после cabina-backup. Нового ПО не нужно: только curl (7.75 и новее) и openssl.
#
# Секретов в этом файле нет. Настройки и ключи доступа лежат только на сервере, в /root/.cabina-offsite.env (права 600):
#   OFFSITE_ENDPOINT=https://storage.example.ru   # адрес хранилища
#   OFFSITE_BUCKET=cabina-backups                 # имя бакета
#   OFFSITE_REGION=ru-central1                    # регион (как у провайдера)
#   OFFSITE_ACCESS_KEY=...                        # ключ ТОЛЬКО на запись (без чтения и удаления)
#   OFFSITE_SECRET_KEY=...
# Ключ только на запись нужен, чтобы взломщик сервера не смог стереть или прочитать вторую копию.
# Хранение 14 дней (как обещано в политике) задаётся правилом бакета у провайдера, а не этим скриптом.
#
# Режимы:  cabina-backup-offsite           отправить самую свежую копию (если она ещё не отправлена)
#          cabina-backup-offsite --test    проверить связь: отправить крошечный файл «ping» и убедиться, что он на месте
set -euo pipefail
umask 077
ENVF=${CABINA_OFFSITE_ENV:-/root/.cabina-offsite.env}
DIR=${CABINA_BACKUP_DIR:-/root/cabina-backups}
STATE=${CABINA_OFFSITE_STATE:-$DIR/.offsite-last}
CURL=${CABINA_CURL:-curl}

[ -r "$ENVF" ] || { echo "нет файла настроек $ENVF" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENVF"
for v in OFFSITE_ENDPOINT OFFSITE_BUCKET OFFSITE_REGION OFFSITE_ACCESS_KEY OFFSITE_SECRET_KEY; do
  [ -n "${!v:-}" ] || { echo "в $ENVF не заполнено $v" >&2; exit 1; }
done
case "$OFFSITE_ENDPOINT" in https://*) ;; http://127.0.0.1*|http://localhost*) ;; *) echo "адрес хранилища должен начинаться с https://" >&2; exit 1 ;; esac
case "$OFFSITE_BUCKET" in *[!a-z0-9.-]*|'') echo "в имени бакета только строчные латинские буквы, цифры, точка и дефис" >&2; exit 1 ;; esac

# ключ передаётся curl через stdin, а не в командной строке: иначе его видно в списке процессов
s3() {
  printf 'user = "%s:%s"\n' "$OFFSITE_ACCESS_KEY" "$OFFSITE_SECRET_KEY" |
    "$CURL" -sS --fail-with-body --max-time 600 --retry 3 --retry-delay 5 -K - \
      --aws-sigv4 "aws:amz:${OFFSITE_REGION}:s3" "$@"
}
put() { # put <файл> <имя в бакете>
  local sum; sum=$(openssl dgst -sha256 -r "$1" | cut -d' ' -f1)
  s3 -T "$1" -H "x-amz-content-sha256: $sum" -o /dev/null "$OFFSITE_ENDPOINT/$OFFSITE_BUCKET/$2"
}
size_remote() { # длина объекта у провайдера; ключ только на запись может не уметь HEAD — тогда пусто
  s3 -I "$OFFSITE_ENDPOINT/$OFFSITE_BUCKET/$1" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="content-length:" {print $2}' | tail -n 1 || true
}

if [ "${1:-}" = "--test" ]; then
  T=$(mktemp); trap 'rm -f "$T"' EXIT
  printf 'cabina offsite ping %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$T"
  put "$T" "ping.txt"
  echo "ok: тестовый файл ping.txt отправлен ($(wc -c < "$T") байт)"
  exit 0
fi

LAST=$(ls -1 "$DIR"/cabina-*.tar 2>/dev/null | sort | tail -n 1 || true)
[ -n "$LAST" ] || { echo "нет ни одной локальной копии в $DIR" >&2; exit 1; }
NAME=$(basename "$LAST")
if [ -s "$STATE" ] && [ "$(cat "$STATE")" = "$NAME" ]; then echo "уже отправлена $NAME"; exit 0; fi
# защита от пустой или обрезанной копии: настоящая начинается как tar с файлом db.dump.enc
# без конвейера: с pipefail «grep -q» мог закрыть канал раньше tar, и проверка ложно не проходила (04.11.2026)
LIST=$(tar -tf "$LAST" 2>/dev/null) || LIST=
case $'\n'"$LIST"$'\n' in *$'\n'db.dump.enc$'\n'*) ;; *) echo "копия $NAME не похожа на настоящую, не отправляю" >&2; exit 1 ;; esac

put "$LAST" "$NAME"
LOCAL=$(wc -c < "$LAST" | tr -d ' ')
REMOTE=$(size_remote "$NAME")
if [ -n "$REMOTE" ] && [ "$REMOTE" != "$LOCAL" ]; then echo "размер у провайдера $REMOTE, а у нас $LOCAL: копия не принята" >&2; exit 1; fi
printf '%s' "$NAME" > "$STATE"
echo "ok $NAME $(du -h "$LAST" | cut -f1)${REMOTE:+, размер сверен}"
