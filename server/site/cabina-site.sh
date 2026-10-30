#!/bin/sh
# CABINA: сайт https://cabina-app.ru/ — забрать новую версию из открытого репозитория и выложить.
#
# Запускается расписанием раз в 2 минуты (/etc/cron.d/cabina-site). Секретов не нужно: репозиторий открытый,
# сервер только читает его. Всё, что связано с интернетом (git), делает системный пользователь cabina-site
# без пароля и входа, в своей папке /srv/cabina-site; к файлам сервера он доступа не имеет. Сам сценарий
# только копирует оттуда файлы приложения (FILES) в папку сайта: папки server/, tests/, описания и история git
# наружу не отдаются, ссылки на другие файлы в выкладку не попадают.
# Каждая версия кладётся в свою папку releases/<коммит>, затем ссылка current переключается одним действием,
# поэтому человек никогда не получит половину старой и половину новой версии. Хранятся 3 последние версии.
set -eu

REPO=${CABINA_REPO:-https://github.com/nikthecreator99/cabina.git}
SRC=${CABINA_SRC:-/srv/cabina-site/src}                           # рабочая копия пользователя cabina-site
WWW=${CABINA_WWW:-/opt/beget/supabase/volumes/proxy/caddy/www}    # внутри Caddy это /etc/caddy/www
RUN=${CABINA_RUN-runuser -u cabina-site -- env HOME=/srv/cabina-site}
FILES="index.html manifest.webmanifest sw.js css js fonts icons data"

# git работает из папки пользователя cabina-site: в папку сайта ему заходить нельзя
cd "$(dirname "$SRC")"
head=$($RUN git ls-remote "$REPO" refs/heads/main | cut -f1)
[ -n "$head" ] || { echo "нет ответа от GitHub" >&2; exit 1; }
[ "$head" = "$(cat "$WWW/rev" 2>/dev/null || true)" ] && exit 0

[ -d "$SRC/.git" ] || $RUN git clone -q --depth 1 --branch main "$REPO" "$SRC"
$RUN git -C "$SRC" fetch -q --depth 1 origin main
rev=$($RUN git -C "$SRC" rev-parse FETCH_HEAD)
$RUN git -C "$SRC" checkout -q --force --detach "$rev"
$RUN git -C "$SRC" clean -qfdx

cd "$WWW"
mkdir -p releases
tmp="releases/$rev.tmp"
rm -rf "$tmp"
mkdir "$tmp"
for f in $FILES; do cp -R "$SRC/$f" "$tmp/"; done
# версия целая (страница и service worker на месте) и без ссылок на чужие файлы — иначе не выкладываем
if [ ! -s "$tmp/index.html" ] || ! grep -q "cabina-v" "$tmp/sw.js" || [ -n "$(find "$tmp" -type l)" ]; then
  rm -rf "$tmp"
  echo "версия $rev неполная или со ссылками — не выкладываю" >&2
  exit 1
fi
chmod -R a+rX,go-w "$tmp"
rm -rf "releases/$rev"
mv "$tmp" "releases/$rev"

ln -sfn "releases/$rev" current.tmp
mv -T current.tmp current
echo "$rev" > rev
ls -1dt releases/*/ | tail -n +4 | xargs -r rm -rf
echo "выложена версия $(grep -o 'cabina-v[0-9.]*' "releases/$rev/sw.js" | head -1), коммит $rev"
