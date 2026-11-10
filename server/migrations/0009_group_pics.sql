-- CABINA, сервер, шаг 9 (2.27): картинка группы, статус в группе — взаимно, «предложить стать коллегами» из группы
-- (просьбы Никиты 10.11.2026).
--
-- 1. Картинка группы. Сервер хранит не картинку, а короткое описание, по которому приложение само её рисует:
--    готовая цифра, готовый рисунок (поезд, светофор…) или свой текст до 8 знаков («ТД-64») — форма, цвет фона,
--    шрифт (Onest или Unbounded, оба — свободная лицензия OFL) и размер текста. Всё проверяется здесь же (private.clean_pic):
--    неизвестное — отказ. Фото и файлы не загружаются. Менять картинку может только администратор группы.
--    Новых персональных данных нет: картинка — свойство группы, как название.
-- 2. Статус в группе — взаимно. Раньше участник видел статус того, кто показывает его группе, даже если сам свой не показывал.
--    Теперь: статус участников группы видит только тот, кто сам показывает этой группе свой статус;
--    «где я» (станции) — только тот, кто сам показывает группе, где он. Правила для коллег (шаг 3) не меняются.
-- 3. Предложить стать коллегами можно и участнику общей группы, даже если его нельзя найти поиском:
--    в группе вы и так видите друг друга. Принять или отказаться решает он сам; остальные правила предложений прежние.
--
-- Приложение 2.26 с этой миграцией работает как раньше (картинку просто не показывает).
-- Приложение 2.27 без неё не даёт сохранить картинку («на сервере ещё не включено»), остальное работает.

alter table public.groups add column pic jsonb
  check (pic is null or (jsonb_typeof(pic) = 'object' and octet_length(pic::text) <= 200));

-- ---------------------------------------------------------------- картинка группы

-- Проверка описания картинки: только известные поля и значения. Возвращает чистое описание; плохое — ошибка.
create function private.clean_pic(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  sh text;
  bg text;
  t text;
  f text;
  sz text;
  n text;
  a text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'cabina: bad pic' using errcode = 'P0001'; end if;
  k := p ->> 'k';
  sh := coalesce(p ->> 'sh', 'rnd');
  bg := coalesce(p ->> 'bg', '0');
  if sh not in ('sq', 'rnd', 'circle') or bg !~ '^[0-7]$' then raise exception 'cabina: bad pic' using errcode = 'P0001'; end if;
  if k = 'num' then
    n := p ->> 'n';
    if n is null or n !~ '^[1-9][0-9]?$' then raise exception 'cabina: bad pic' using errcode = 'P0001'; end if;
    return jsonb_build_object('k', k, 'n', n::int, 'sh', sh, 'bg', bg::int);
  elsif k = 'art' then
    a := p ->> 'a';
    if a is null or a not in ('eloc', 'diesel', 'steam', 'light', 'rails', 'wheel', 'wagon', 'cap') then
      raise exception 'cabina: bad pic' using errcode = 'P0001';
    end if;
    return jsonb_build_object('k', k, 'a', a, 'sh', sh, 'bg', bg::int);
  elsif k = 'text' then
    t := private.clean(p ->> 't', 9);   -- длиннее 8 знаков — отказ, а не обрезка
    f := coalesce(p ->> 'f', 'u');
    sz := coalesce(p ->> 'sz', '2');
    if t is null or t !~ '^[0-9A-Za-zА-Яа-яЁё №.-]{1,8}$' or f not in ('o', 'u') or sz !~ '^[1-3]$' then
      raise exception 'cabina: bad pic' using errcode = 'P0001';
    end if;
    return jsonb_build_object('k', k, 't', t, 'f', f, 'sz', sz::int, 'sh', sh, 'bg', bg::int);
  end if;
  raise exception 'cabina: bad pic' using errcode = 'P0001';
end $$;

-- Поставить или убрать (null) картинку группы — только администратор
create function public.set_group_pic(p_group uuid, p_pic jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  v jsonb := case when p_pic is null or p_pic = 'null'::jsonb then null else private.clean_pic(p_pic) end;
begin
  if not private.group_admin(p_group, u) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  update public.groups set pic = v where id = p_group;
end $$;

-- ---------------------------------------------------------------- статус в группе — взаимно

-- Показывает ли owner вошедшему это ('status' или 'place'): коллеге — как раньше (шаг 3); участнику общей группы —
-- если owner сам показывает этой группе статус (и «где я» — для 'place'), И вошедший тоже показывает этой группе своё:
-- статус за статус, «где я» за «где я».
create or replace function private.allowed(owner uuid, what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and owner <> auth.uid() and (
    (exists (select 1 from public.links l where l.state = 'accepted'
             and least(l.from_id, l.to_id) = least(owner, auth.uid()) and greatest(l.from_id, l.to_id) = greatest(owner, auth.uid()))
     and exists (select 1 from public.access a where a.user_id = owner and a.item = what
                 and (a.viewer_id is null or a.viewer_id = auth.uid())))
    or exists (select 1 from public.group_members o join public.group_members v on v.group_id = o.group_id and v.user_id = auth.uid()
               where o.user_id = owner and o.show_status and v.show_status
                 and (what = 'status' or (o.show_place and v.show_place))))
$$;

-- ---------------------------------------------------------------- предложить стать коллегами из группы

-- Как раньше (шаг 2), только позвать можно и участника общей группы, даже если его нельзя найти поиском.
create or replace function public.offer_colleague(p_to uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  l public.links;
  had boolean;
begin
  if p_to is null or p_to = u then raise exception 'cabina: not found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.cards where user_id = u) then raise exception 'cabina: name required' using errcode = 'P0001'; end if;
  select * into l from public.links where id = private.pair(u, p_to) for update;
  had := found;
  if had then
    if l.state = 'accepted' then return 'already'; end if;
    if l.state = 'pending' and l.from_id = u then return 'sent'; end if;
    if l.state = 'pending' then
      -- он уже предложил мне: моё предложение — это и есть ответ «да»
      update public.links set state = 'accepted', answered_at = now() where id = l.id;
      return 'accepted';
    end if;
    -- отклонено: кому отказали, ждёт паузу; кто отказал, может передумать
    if l.from_id = u and l.answered_at > now() - make_interval(days => private.conf('decline_days')::int) then
      raise exception 'cabina: later' using errcode = 'P0001';
    end if;
  end if;
  -- позвать можно того, кто сам разрешил себя находить, или участника общей группы (иначе — как будто его нет)
  if not exists (select 1 from public.cards where user_id = p_to and searchable) and not private.group_mate(p_to) then
    raise exception 'cabina: not found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.links where from_id = u and state = 'pending') >= private.conf('offers_pending')::int then
    raise exception 'cabina: limit' using errcode = 'P0001';
  end if;
  perform private.spend(u, 'offer');
  if had then
    update public.links set from_id = u, to_id = p_to, state = 'pending', created_at = now(), answered_at = null where id = l.id;
  else
    insert into public.links (from_id, to_id) values (u, p_to);
  end if;
  return 'sent';
end $$;

-- ---------------------------------------------------------------- права на функции

revoke all on function private.clean_pic(jsonb) from public, anon, authenticated;
revoke all on function public.set_group_pic(uuid, jsonb) from public, anon;
grant execute on function public.set_group_pic(uuid, jsonb) to authenticated;
-- allowed и offer_colleague пересозданы через create or replace — права остались прежними

notify pgrst, 'reload schema';
