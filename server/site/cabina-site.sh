#!/bin/sh
# CABINA: сайт https://cabina-app.ru/ — забрать новую версию из открытого репозитория и выложить.
#
# Запускается расписанием раз в 2 минуты (/etc/cron.d/cabina-site) от системного пользователя cabina-site:
# у него нет пароля и входа, писать он может только в папку сайта. Секретов не нужно: репозиторий открытый,
# сервер только читает его. На сайт попадают лишь файлы приложения (FILES): папки server/, tests/,
# описания и история git наружу не отдаются.
# Каждая версия кладётся в свою папку releases/<коммит>, затем ссылка current переключается одним действием,
# поэтому человек никогда не получит половину старой и половину новой версии. Хранятся 3 последние версии.
set -eu

REPO=${CABINA_REPO:-https://github.com/nikthecreator99/cabina.git}
WWW=${CABINA_WWW:-/opt/beget/supabase/volumes/proxy/caddy/www}   # внутри Caddy это /etc/caddy/www
FILES="index.html manifest.webmanifest sw.js css js fonts icons data"

cd "$WWW"
head=$(git ls-remote "$REPO" refs/heads/main | cut -f1)
[ -n "$head" ] || { echo "нет ответа от GitHub" >&2; exit 1; }
[ "$head" = "$(cat rev 2>/dev/null || true)" ] && exit 0

[ -d src/.git ] || git clone -q --depth 1 --branch main "$REPO" src
git -C src fetch -q --depth 1 origin main
rev=$(git -C src rev-parse FETCH_HEAD)
git -C src checkout -q --force --detach "$rev"
git -C src clean -qfdx

mkdir -p releases
rm -rf "releases/$rev.tmp"
mkdir "releases/$rev.tmp"
for f in $FILES; do cp -R "src/$f" "releases/$rev.tmp/"; done
# простая проверка, что версия целая: страница и service worker на месте
[ -s "releases/$rev.tmp/index.html" ] && grep -q "cabina-v" "releases/$rev.tmp/sw.js"
chmod -R a+rX,go-w "releases/$rev.tmp"
rm -rf "releases/$rev"
mv "releases/$rev.tmp" "releases/$rev"

ln -sfn "releases/$rev" current.tmp
mv -T current.tmp current
echo "$rev" > rev
ls -1dt releases/*/ | tail -n +4 | xargs -r rm -rf
echo "выложена версия $(grep -o 'cabina-v[0-9.]*' "releases/$rev/sw.js" | head -1), коммит $rev"
