-- CABINA, сервер, шаг 4 (2.16.1): сайт переехал с GitHub Pages на https://cabina-app.ru/ (наш сервер в России).
--
-- Адрес сайта — обязательная часть согласия на распространение (152-ФЗ, ст. 10.1; приказ Роскомнадзора № 18:
-- сведения об информационных ресурсах, через которые данные доступны). Поэтому новая редакция publish-2.
-- Кто давал publish-1, пропадает из поиска, пока сам не примет новую редакцию: приложение выключит «Меня можно найти»
-- и предложит включить снова. Записи о прежнем согласии остаются в истории (их видно в «Мои данные на сервере»).

update private.config set value = 'publish-2' where key = 'publish_version';

update public.cards c set searchable = false, updated_at = now()
  where c.searchable and not private.has_consent(c.user_id, 'publish-2');

-- Сервер API (PostgREST) перечитывает настройки
notify pgrst, 'reload schema';
