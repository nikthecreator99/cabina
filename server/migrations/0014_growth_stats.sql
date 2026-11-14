-- CABINA, сервер, шаг 14 (2.32.2): расширенная статистика роста для администратора (просьба Никиты 14.11.2026).
--
-- Только числа и только администратору. Ничего нового о человеке сервер не хранит:
--   * private.stats_daily — плюс одно число за день: сколько аккаунтов заходило в CABINA в этот день (metric = 'active').
--     Это сумма, без того, кто именно: прибавляется в touch() при первом заходе человека за сутки. Сами даты заходов
--     человека по-прежнему не хранятся (у него — только дата последнего захода и число разных дней).
--   * public.admin_growth(...) — числа за выбранный период и за такой же прошлый период: регистрации, подтверждения почты,
--     удаления, приходы по приглашениям, новые группы, заходы по дням, «остаются через 7 и 30 дней» (примерно: по дате
--     регистрации и дате последнего захода), и сколько людей сейчас пользуется «Коллегами», статусом, часами, заметками, группами.
--     Почты, имён, идентификаторов, депо, текстов и станций в ответе нет.
-- Согласие менять не нужно: «подсчёт обезличенной статистики … без связи с моей почтой» в нём уже есть.
--
-- Можно применять в любой момент: приложение до 2.32.2 продолжает показывать прежнюю статистику (admin_stats не меняется),
-- приложение 2.32.2 без этой миграции показывает прежнее окно со словами «расширенная статистика — после обновления сервера».
-- От шага 13 (поиск групп) не зависит.

insert into private.config (key, value) values
  ('active_since', (now() at time zone 'Europe/Moscow')::date::text)   -- с какого дня считаются заходы по дням
  on conflict (key) do nothing;

alter table private.stats_daily drop constraint stats_daily_metric_check;
alter table private.stats_daily add constraint stats_daily_metric_check check (metric in ('signup', 'confirmed', 'deleted', 'active'));

-- ---------------------------------------------------------------- «заходил сегодня»

-- Как раньше, и ещё +1 к числу заходивших за сутки — один раз за сутки на человека.
-- День регистрации сюда не попадает (в нём last_seen уже «сегодня»): его считает регистрация.
create or replace function public.touch(p_platform text, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  first_today boolean;
  plat text;
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  select last_seen is distinct from private.today() into first_today from public.profiles where id = auth.uid() for update;
  update public.profiles set
    active_days = active_days + case when last_seen is distinct from private.today() then 1 else 0 end,
    last_seen = private.today(),
    platform = case when p_platform in ('web', 'android', 'ios') then p_platform else platform end,
    app_version = case when p_version ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$' then p_version else app_version end
  where id = auth.uid()
  returning platform into plat;
  if found and first_today then perform private.bump('active', plat); end if;
end $$;

-- ---------------------------------------------------------------- числа за период

-- Итоги одного периода [f, e] (московские сутки)
create function private.growth_sum(f date, e date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'from', f, 'to', e,
    'signup', (select coalesce(sum(value), 0) from private.stats_daily where metric = 'signup' and day between f and e),
    'confirmed', (select coalesce(sum(value), 0) from private.stats_daily where metric = 'confirmed' and day between f and e),
    'deleted', (select coalesce(sum(value), 0) from private.stats_daily where metric = 'deleted' and day between f and e),
    -- заходы: только за дни, когда они уже считались (с active_since); день регистрации — по регистрациям
    'active_sum', (select coalesce(sum(value), 0) from private.stats_daily
                   where metric in ('active', 'signup') and day between greatest(f, private.conf('active_since')::date) and e),
    'active_days', greatest(0, e - greatest(f, private.conf('active_since')::date) + 1),
    'invited', (select count(*) from private.invites
                where created_by is not null and used_at is not null
                  and (used_at at time zone 'Europe/Moscow')::date between f and e),
    'invited_admin', (select count(*) from private.invites
                      where created_by is null and used_at is not null
                        and (used_at at time zone 'Europe/Moscow')::date between f and e),
    'groups', (select count(*) from public.groups where (created_at at time zone 'Europe/Moscow')::date between f and e),
    -- кто зарегистрировался в периоде (и не удалил аккаунт): сколько из них заходили через 7 и 30 дней и позже
    'cohort', (select jsonb_build_object(
        'n', count(*),
        'age7', count(*) filter (where p.created_on <= private.today() - 7),
        'back7', count(*) filter (where p.created_on <= private.today() - 7 and p.last_seen >= p.created_on + 7),
        'age30', count(*) filter (where p.created_on <= private.today() - 30),
        'back30', count(*) filter (where p.created_on <= private.today() - 30 and p.last_seen >= p.created_on + 30))
      from public.profiles p where p.created_on between f and e)
  )
$$;

-- p_from / p_to — выбранный период; p_prev_from / p_prev_to — с чем сравнивать (пусто — без сравнения).
-- Пустой p_from — с первой регистрации. Период — не длиннее 10 лет.
create function public.admin_growth(p_from date, p_to date, p_prev_from date default null, p_prev_to date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t date := private.today();
  first_day date := coalesce((select min(created_on) from public.profiles), t);
  f date := coalesce(p_from, first_day);
  e date := least(coalesce(p_to, t), t);
  since date := private.conf('active_since')::date;
begin
  if not private.is_admin() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  if f > e or e - f > 3700 then raise exception 'cabina: bad period' using errcode = 'P0001'; end if;
  if (p_prev_from is null) <> (p_prev_to is null) or p_prev_from > p_prev_to or p_prev_to - p_prev_from > 3700 then
    raise exception 'cabina: bad period' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'today', t,
    'first_day', first_day,
    'active_since', since,
    'base', (select count(*) from public.profiles where created_on < f),   -- аккаунтов к началу периода (из тех, что есть сейчас)
    'cur', private.growth_sum(f, e),
    'prev', case when p_prev_from is null then null else private.growth_sum(p_prev_from, least(p_prev_to, t)) end,
    -- по дням: только дни, где что-то было
    'days', coalesce((select jsonb_agg(jsonb_strip_nulls(x) order by x ->> 'd') from (
        select jsonb_build_object('d', d,
          'signup', nullif(sum(v) filter (where k = 'signup'), 0),
          'confirmed', nullif(sum(v) filter (where k = 'confirmed'), 0),
          'deleted', nullif(sum(v) filter (where k = 'deleted'), 0),
          'active', case when d >= since then nullif(sum(v) filter (where k in ('active', 'signup')), 0) end,
          'invited', nullif(sum(v) filter (where k = 'invited'), 0),
          'groups', nullif(sum(v) filter (where k = 'groups'), 0),
          'joined', nullif(sum(v) filter (where k = 'joined'), 0)) x
        from (
          select day d, metric k, value v from private.stats_daily where day between f and e
          union all
          select (used_at at time zone 'Europe/Moscow')::date, 'invited', 1 from private.invites
            where created_by is not null and used_at is not null and (used_at at time zone 'Europe/Moscow')::date between f and e
          union all
          select (created_at at time zone 'Europe/Moscow')::date, 'groups', 1 from public.groups
            where (created_at at time zone 'Europe/Moscow')::date between f and e
          union all
          select created_on, 'joined', 1 from public.profiles where created_on between f and e
        ) s group by d) q), '[]'::jsonb),
    -- сейчас: сколько людей пользуется чем (только числа)
    'now', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'confirmed', (select count(*) from auth.users u join public.profiles p on p.id = u.id where u.email_confirmed_at is not null),
      'active_1', (select count(*) from public.profiles where last_seen >= t),
      'active_7', (select count(*) from public.profiles where last_seen > t - 7),
      'active_30', (select count(*) from public.profiles where last_seen > t - 30),
      'colleagues', (select count(*) from public.cards),
      'findable', (select count(*) from public.cards where searchable),
      'links', (select count(*) from public.links where state = 'accepted'),
      'status', (select count(*) from public.statuses where expires_at > now()),
      'place', (select count(*) from public.status_places),
      'hours', (select count(*) from public.hours where expires_at > now()),
      'notes', (select count(distinct user_id) from public.loco_notes),
      'groups', (select count(*) from public.groups),
      'in_groups', (select count(distinct user_id) from public.group_members),
      'group_status', (select count(distinct user_id) from public.group_members where show_status),
      'platforms', coalesce((select jsonb_object_agg(k, n) from (
          select coalesce(platform, 'unknown') k, count(*) n from public.profiles group by 1) s), '{}'::jsonb),
      'versions', coalesce((select jsonb_object_agg(k, n) from (
          select coalesce(app_version, 'unknown') k, count(*) n from public.profiles group by 1) s), '{}'::jsonb))
  );
end $$;

-- ---------------------------------------------------------------- права на функции

revoke all on function private.growth_sum(date, date) from public, anon, authenticated;
revoke all on function public.admin_growth(date, date, date, date) from public, anon;
grant execute on function public.admin_growth(date, date, date, date) to authenticated;
-- touch пересоздана через create or replace — права остались прежними

notify pgrst, 'reload schema';
