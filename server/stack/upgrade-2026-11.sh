#!/bin/bash
# CABINA: исправления после проверки безопасности 14.11.2026 — один раз на сервере, от root.
#
#   1) Caddy: ограничение размера запроса — вход 16 КБ, база (PostgREST) 256 КБ; больше — ответ 413;
#   2) свои пароли базы у входа (supabase_auth_admin) и PostgREST (authenticator) вместо главного пароля.
#
# Файлы на сервере правятся точечно (не заменяются целиком), поэтому скрипт работает и до, и после шага 15
# (CABINA AI). Повторный запуск безопасен: что уже сделано, пропускается. Перед правкой — копии *.bak-2026-11.
# Если после перезапуска вход, база или сайт не отвечают — всё возвращается как было, и скрипт пишет об этом.
# Пароли на экран не выводятся. Сайт и вход недоступны несколько секунд, пока перезапускаются программы.
#
# Запуск (сначала обновить копию репозитория на сервере):
#   git -C /opt/cabina/repo fetch -q origin main && git -C /opt/cabina/repo checkout -q FETCH_HEAD \
#     && bash /opt/cabina/repo/server/stack/upgrade-2026-11.sh
set -euo pipefail
umask 077
cd "${CABINA_DIR:-/opt/cabina}"
REPO=${CABINA_REPO_DIR:-/opt/cabina/repo}
API=api.cabina-app.ru
say() { printf '\n== %s\n' "$*"; }
die() { printf '\nСТОП: %s\n' "$*" >&2; exit 1; }

[ -f docker-compose.yml ] && [ -f Caddyfile ] && [ -f .env ] || die "нет docker-compose.yml, Caddyfile или .env в $(pwd)"
[ -f "$REPO/server/stack/db-passwords.sh" ] || die "в $REPO нет db-passwords.sh — сначала обновите копию репозитория (команда выше)"
ANON=$(sed -n 's/^ANON_KEY=//p' .env | tail -n 1)
[ -n "$ANON" ] || die "в .env нет ANON_KEY"

say "1. Копии файлов"
for f in docker-compose.yml Caddyfile .env; do [ -e "$f.bak-2026-11" ] || cp -p "$f" "$f.bak-2026-11"; done
echo "ok: docker-compose.yml, Caddyfile, .env → *.bak-2026-11"

say "2. Caddyfile: ограничение размера запроса"
add_limit() { # add_limit <путь> <размер>: строка request_body сразу после «handle_path <путь> {»
  local path=$1 size=$2 n
  n=$(grep -cF "handle_path $path {" Caddyfile || true)
  [ "$n" = 1 ] || die "в Caddyfile не нашёл ровно один блок handle_path $path (нашёл $n) — ничего не менял, напишите Claude"
  if awk -v p="handle_path $path {" 'index($0,p){getline; getline; print; exit}' Caddyfile | grep -q max_size; then
    echo "уже есть: $path"; return
  fi
  awk -v p="handle_path $path {" -v s="$size" '{print} index($0,p){print "\t\trequest_body {"; print "\t\t\tmax_size " s; print "\t\t}"}' \
    Caddyfile > Caddyfile.new
  cat Caddyfile.new > Caddyfile && rm -f Caddyfile.new   # cat, а не mv: файл подключён в контейнер, его нельзя подменять
  echo "добавлено: $path — $size"
}
add_limit '/auth/v1/*' 16KB
add_limit '/rest/v1/*' 256KB
docker exec cabina-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
  || { cat Caddyfile.bak-2026-11 > Caddyfile; die "новый Caddyfile не прошёл проверку — вернул прежний, ничего не перезапускал"; }
echo "ok: Caddyfile проверен"

say "3. docker-compose.yml: свои пароли у входа и PostgREST"
sub() { # sub <роль> <переменная>
  local role=$1 var=$2
  if grep -q "$role:\${$var" docker-compose.yml; then echo "уже есть: $role"; return; fi
  [ "$(grep -c "$role:\${POSTGRES_PASSWORD}@" docker-compose.yml || true)" = 1 ] \
    || die "в docker-compose.yml не нашёл строку подключения $role — ничего не менял, напишите Claude"
  sed -i "s|$role:\${POSTGRES_PASSWORD}@|$role:\${$var:?нет $var в .env — запустите db-passwords.sh}@|" docker-compose.yml
  echo "заменено: $role"
}
sub supabase_auth_admin AUTH_DB_PASSWORD
sub authenticator AUTHENTICATOR_PASSWORD

rollback() {
  printf '\nОТКАТ: возвращаю прежние файлы и пароли…\n' >&2
  cp -p docker-compose.yml.bak-2026-11 docker-compose.yml
  cat Caddyfile.bak-2026-11 > Caddyfile
  bash "$REPO/server/stack/db-passwords.sh" --old || true
  docker compose up -d auth rest >/dev/null 2>&1 || true
  docker compose restart caddy >/dev/null 2>&1 || true
  die "$1. Всё возвращено как было (пароли в .env остались, они ни на что не влияют). Пришлите этот текст Claude."
}

say "4. Пароли в базе и перезапуск"
bash "$REPO/server/stack/db-passwords.sh" || rollback "не получилось поставить пароли"
docker compose config -q || rollback "docker-compose.yml не читается"
docker compose up -d auth rest || rollback "вход или PostgREST не запустились"
docker compose restart caddy || rollback "Caddy не перезапустился"

say "5. Проверка (до 90 секунд)"
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$1:443:127.0.0.1" "${@:2}" || true; }
ok=
for _ in $(seq 1 18); do
  sleep 5
  site=$(code cabina-app.ru https://cabina-app.ru/)
  # вход: неверный пароль → 400 (значит, вход достучался до базы); нет связи с базой — 500
  auth=$(code $API -X POST "https://$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
    --data '{"email":"upgrade-check@cabina-app.ru","password":"no-such-password"}')
  # PostgREST: без входа читать нельзя → 401; нет связи с базой — 503
  rest=$(code $API "https://$API/rest/v1/profiles?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
  if [ "$site" = 200 ] && [ "$auth" = 400 ] && [[ "$rest" =~ ^(200|401|403)$ ]]; then ok=1; break; fi
done
echo "сайт $site, вход $auth, база $rest"
[ -n "$ok" ] || rollback "после перезапуска не отвечает (сайт $site, вход $auth, база $rest)"
big=$(head -c 300000 /dev/zero | tr '\0' 'a' | code $API -X POST "https://$API/rest/v1/rpc/touch" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' --data-binary @-)
echo "запрос 300 КБ → $big (ждём 413)"
[ "$big" = 413 ] || echo "ВНИМАНИЕ: большой запрос не отклонён ($big) — всё работает, но пришлите это Claude"

say "Готово"
echo "Копии прежних файлов: /opt/cabina/*.bak-2026-11 (можно удалить через неделю)."
