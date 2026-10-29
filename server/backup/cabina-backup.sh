#!/bin/bash
# Ночная резервная копия базы аккаунтов CABINA (на сервере: /usr/local/bin/cabina-backup, запуск из cron).
# Копия шифруется ОТКРЫТЫМ ключом Никиты: расшифровать её можно только закрытым ключом,
# который хранится у него на MacBook. На сервере закрытого ключа нет, поэтому копия бесполезна
# для того, кто её украдёт. Хранятся 14 дней (столько обещано в политике), старые удаляются.
# Секретов в этом файле нет.
set -euo pipefail
umask 077
DIR=${CABINA_BACKUP_DIR:-/root/cabina-backups}
PUB=${CABINA_BACKUP_KEY:-/root/cabina-backup-public.pem}
DUMP=${CABINA_DUMP_CMD:-docker exec supabase-db pg_dump -U postgres -d postgres -Fc -n auth -n public -n private}
CHECK=${CABINA_CHECK_CMD:-docker exec -i supabase-db pg_restore -l}

[ -s "$PUB" ] || { echo "нет открытого ключа $PUB" >&2; exit 1; }
mkdir -p "$DIR"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

$DUMP > "$TMP/db.dump"
$CHECK < "$TMP/db.dump" > /dev/null          # копия читается — иначе ошибка и старые копии не трогаем
[ "$(head -c 5 "$TMP/db.dump")" = "PGDMP" ] || { echo "копия повреждена" >&2; exit 1; }

# Случайный ключ на одну копию: им шифруется база, а сам ключ — открытым ключом Никиты
KEY=$(openssl rand -hex 32)
IV=$(openssl rand -hex 16)
openssl enc -aes-256-cbc -K "$KEY" -iv "$IV" -in "$TMP/db.dump" -out "$TMP/db.dump.enc"
printf '%s %s\n' "$KEY" "$IV" | openssl pkeyutl -encrypt -pubin -inkey "$PUB" -pkeyopt rsa_padding_mode:oaep -out "$TMP/key.enc"
unset KEY IV
rm -f "$TMP/db.dump"

NAME="cabina-$(date -u +%Y-%m-%d_%H%M).tar"
tar -C "$TMP" -cf "$DIR/$NAME.part" db.dump.enc key.enc
mv "$DIR/$NAME.part" "$DIR/$NAME"
find "$DIR" -maxdepth 1 -name 'cabina-*.tar' -mtime +13 -delete
echo "ok $NAME $(du -h "$DIR/$NAME" | cut -f1)"
