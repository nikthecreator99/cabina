# CABINA: сервер на Селектеле (с 03.11.2026)

После атаки на Beget (ночь 1→2 ноября 2026, данные VPS потеряны) сайт и сервер аккаунтов собраны заново
на облачном сервере Селектела: Ubuntu 24.04, 1 vCPU / 2 ГБ, Москва, адрес 31.129.49.87.
**Секретов в этой папке нет и быть не должно** — они создаются на сервере скриптом `make-env.sh` в `/opt/cabina/.env`.

## Что где

| На сервере | Откуда | Что это |
|---|---|---|
| `/opt/cabina/docker-compose.yml` | `server/stack/` | база, вход, PostgREST, Caddy |
| `/opt/cabina/Caddyfile` | `server/stack/` | HTTPS, сайт, `api.cabina-app.ru` (только `/auth/v1`, `/rest/v1`), CORS |
| `/opt/cabina/db/roles.sql`, `jwt.sql` | `server/stack/db/` | пароли служебных ролей при первом запуске базы |
| `/opt/cabina/db/data/` | — | сама база (в резервную копию — через `pg_dump`, см. ниже) |
| `/opt/cabina/mail/` | `server/mail/` | письма с кодом и значок для них |
| `/opt/cabina/www/` | `cabina-site.sh` | сайт: `releases/<коммит>` и ссылка `current` |
| `/opt/cabina/.env` | `make-env.sh` | секреты (chmod 600) |
| `/opt/cabina/repo/` | `git clone` | открытый репозиторий, из него копируются файлы выше |

Наружу открыты только 22 (SSH по ключу), 80 и 443. Порт базы не публикуется вовсе. Studio, хранилище файлов,
realtime, функции, аналитика и пулер Supabase не ставятся.

Журналы: Caddy журнал обращений не ведёт. Вход (GoTrue) пишет только предупреждения и ошибки; в строке ошибки
(например, «письмо не ушло») бывают почта и IP, поэтому журнал каждого контейнера ограничен двумя файлами по 5 МБ
и перезаписывается сам. PostgREST — только ошибки, база — только фатальные.

## Установка (по шагам, всё — от root)

1. Docker: `apt install docker.io docker-compose-v2`, ufw: `deny incoming`, `allow 22,80,443/tcp`.
2. Файлы:
   ```sh
   git clone https://github.com/nikthecreator99/cabina.git /opt/cabina/repo
   git -C /opt/cabina/repo checkout <коммит, который назвал Claude>
   cd /opt/cabina && cp repo/server/stack/docker-compose.yml repo/server/stack/Caddyfile . \
     && mkdir -p db mail www && cp repo/server/stack/db/*.sql db/ && cp repo/server/mail/* mail/
   ```
3. Секреты: `sh repo/server/stack/make-env.sh` — печатает публичный `ANON_KEY` для `js/auth.js`.
4. База и вход: `docker compose up -d db auth rest`, через минуту `docker compose ps` — `healthy`.
5. Миграции по порядку (`0001`…`0005`):
   `docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < repo/server/migrations/0001_accounts.sql`
6. Сайт: пользователь `cabina-site` и выкладка раз в 2 минуты:
   ```sh
   useradd --system --home-dir /srv/cabina-site --create-home --shell /usr/sbin/nologin cabina-site
   install -m 755 repo/server/site/cabina-site.sh /usr/local/bin/cabina-site
   echo '*/2 * * * * root CABINA_WWW=/opt/cabina/www /usr/local/bin/cabina-site 2>&1 | logger -t cabina-site' > /etc/cron.d/cabina-site
   CABINA_WWW=/opt/cabina/www /usr/local/bin/cabina-site
   ```
7. Caddy: `docker compose up -d caddy` — когда записи A указывают сюда, сам получит сертификаты.
8. Почта для кодов — почтовый сервис Селектела (панель → «Продукты» → «Почтовый сервис», ресурс `cabina`, домен cabina-app.ru;
   в DNS — TXT владения, SPF `v=spf1 include:spf.mail.selcloud.ru include:_spf.beget.com ~all`, DKIM `selcloud._domainkey`,
   DMARC `v=DMARC1; p=quarantine;`). Селектел закрывает исходящие 25/465/587, поэтому порт 1126 (STARTTLS, сертификат проверяется).
   `sh repo/server/stack/set-mail.sh` (логин — число «Login», пароль — «Pass (API-key)»), затем `docker compose up -d auth`.
   Отправитель — `noreply@cabina-app.ru` (`SMTP_FROM`). Ограничение сервиса — 20 писем за 5 минут.
9. Очистка журналов входа раз в сутки:
   `echo '15 0 * * * root docker exec supabase-db psql -U postgres -d postgres -qc "select private.cleanup_logs()"' > /etc/cron.d/cabina-cleanup`
10. Резервные копии — `server/backup/` (ночная копия на сервере и вторая в Яндекс Облаке), см. `server/README.md`.
11. Администратор — после своей регистрации (см. `server/README.md`, п. 8).

## Проверка после установки

- `https://cabina-app.ru/` открывается, `https://api.cabina-app.ru/` — 404, `https://api.cabina-app.ru/auth/v1/health` — ответ GoTrue.
- Регистрация без приглашения отклоняется (`cabina: invite required`); `anon` не читает `profiles` и не вызывает `admin_stats`.
- `ss -tlnp` — снаружи слушают только 22, 80, 443; `docker ps` — порты есть только у `cabina-caddy`.

Проверено 03.11.2026 на копии этого набора в Docker: сайт и заголовки, перенаправление `www`, CORS только для
`https://cabina-app.ru`, миграции 0001–0005, регистрация по приглашению → письмо с кодом → подтверждение → чтение
своего профиля и `export_my_data`, отказ `anon`, удаление аккаунта, ночная копия `cabina-backup.sh`.

Менять файлы на сервере: сначала копия `.bak`, потом правка, потом `docker compose up -d` и проверка.
