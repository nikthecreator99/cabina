# CABINA AI — сервер помощника (2.34)

Справочный помощник по открытым документам: вопрос → поиск кусков документов в нашей базе (Селектел, Россия) →
YandexGPT (Яндекс Облако, Россия) отвечает только по найденному, со ссылками на пункты. Нет ответа — так и говорит.

- `core.mjs` — правила без сети: чистка вопроса, вырезание телефонов/почты/номеров, текст для нейросети, разбор ответа.
- `server.mjs` — маленький HTTP-сервер (Node 22, без зависимостей): `POST /ask`, `GET /health`. Ключ входа человека
  проверяет PostgREST (все rpc выполняются от его имени), лимиты и режим — в базе (`ai_begin`, миграция 0015).
- `split.mjs`, `ingest.mjs` — нарезка документов и загрузка в базу (запускает администратор).
- Автотесты: `tests/unit/v234-ai.test.js`, `server/tests/ai.test.js`, `tests/e2e/v234-ai.test.js`.

**Секретов здесь нет и быть не должно.** Ключ Яндекса — только в `/opt/cabina/.env` на сервере.

## Что уходит в Яндекс и что хранится

- В Яндекс: только текст вопроса (после вырезания почты, телефонов, номеров от 5 цифр) и найденные куски документов.
  Ни ключа входа, ни почты, ни id человека. Каждый запрос — с `x-data-logging-enabled: false` (Яндекс не сохраняет).
- В нашей базе: документы и куски (`private.ai_docs`, `private.ai_chunks`), счётчик вопросов человека за день
  (`private.limits.ai_questions`) и общий за день (`private.ai_daily`). Самих вопросов и ответов на сервере нет.
- В журнал сервера пишется только код ошибки, без вопроса.
- История вопросов — только в телефоне (`localStorage['cabina-ai-history']`), стирается при выходе из аккаунта.

## Режим и лимиты (`private.config`)

| ключ | по умолчанию | смысл |
|---|---|---|
| `ai_mode` | `admin` | `off` — выключен, `admin` — только администратор, `members` — все с аккаунтом |
| `ai_per_day` | 10 | вопросов в день у человека |
| `ai_admin_per_day` | 100 | у администратора |
| `ai_all_per_day` | 300 | всего за день у всех (потолок расходов) |

Перед `members`: изменение уведомления в Роскомнадзор (новая цель, обработчик ООО «Яндекс.Облако»),
новая редакция согласия, плашка в приложении для всех (`aiVisible` в `js/ai.js`).

## Развёртывание (один раз)

1. Яндекс Облако → каталог → сервисный аккаунт `cabina-ai` с одной ролью `ai.languageModels.user` →
   API-ключ с областью `yc.ai.languageModels.execute`. В биллинге — уведомление о бюджете.
2. На сервере (после свежей резервной копии):
   ```bash
   cd /opt/cabina/repo && git pull
   mkdir -p /opt/cabina/ai && cp server/ai/*.mjs /opt/cabina/ai/
   cp server/stack/docker-compose.yml server/stack/Caddyfile /opt/cabina/
   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < server/migrations/0015_ai.sql
   ```
   Нужен pgvector: в образе `supabase/postgres` он есть (миграция делает `create extension vector`).
3. В `/opt/cabina/.env` (chmod 600) дописать `YC_API_KEY=…` и `YC_FOLDER_ID=…`.
4. `cd /opt/cabina && docker compose up -d ai caddy`, проверить `docker logs cabina-ai` и
   `curl -s https://api.cabina-app.ru/ai/v1/health` → `{"ok":true}`.

## Загрузка документов

Только открытые документы: на каждом проверить, что нет пометки «Для служебного пользования» / «ДСП».
Тексты документов в репозиторий не кладём (он публичный) — они лежат на сервере в отдельной папке.

```bash
# docs.json: [{ "id": "tk", "title": "Трудовой кодекс РФ", "edition": "ред. от …", "source": "https://…",
#               "file": "tk.txt", "mode": "articles" }]   mode: articles (кодексы) | points (приказы, ПТЭ, колдоговор)
# node на самом сервере не нужен — запускаем в том же образе, что и помощник
set -a; . /opt/cabina/.env; set +a   # в контейнер передаём только два ключа Яндекса
docker run --rm -e YC_API_KEY -e YC_FOLDER_ID -v /opt/cabina/ai:/app:ro -v /opt/cabina/ai-docs:/docs:ro \
  node:22.20.0-alpine node /app/ingest.mjs /docs/docs.json > /tmp/ai-docs.sql
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/ai-docs.sql
rm /tmp/ai-docs.sql
```

Повторная загрузка документа с тем же `id` заменяет его целиком. Новая редакция — поменять `edition` и загрузить заново.
