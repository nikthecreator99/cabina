-- CABINA, сервер, шаг 3 (2.16): кому из коллег что видно.
--
-- Раньше статус видели все коллеги. Теперь человек сам выбирает, кто из его коллег видит:
--   'status' — статус («в пути», «на отдыхе», «между поездками»…) без станций;
--   'place'  — станции и дом отдыха в статусе (только тем, кто видит и сам статус).
-- Для каждого — «все коллеги» (viewer_id пустой, и те, кто появится позже) или выбранные коллеги.
-- Нет правила — не видит никто. Новых сведений о человеке не появляется: это выбор, кому из коллег
-- показывать то, что и так собирается по согласию privacy-2.
--
--   public.access        — правила «кому видно» (свои видит только сам человек);
--   public.status_places — станции и дом отдыха из статуса, со своим правилом доступа.
-- Станции переехали из public.statuses: так «кто видит, где я» решает сама база (RLS), а не приложение.
-- Столбцы statuses.place и statuses.dest остаются пустыми, чтобы приложение 2.15 не сломалось до обновления.

-- ---------------------------------------------------------------- таблицы

create table public.access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,   -- чьё
  item text not null check (item in ('status', 'place')),               -- что
  viewer_id uuid references auth.users (id) on delete cascade,          -- кому; пусто — всем коллегам
  created_at timestamptz not null default now(),
  check (viewer_id is distinct from user_id)
);
create unique index access_one on public.access (user_id, item, coalesce(viewer_id, '00000000-0000-0000-0000-000000000000'));
create index access_viewer on public.access (viewer_id);

-- Удаляется вместе со статусом (выключил, устарел, нет коллег, удалил аккаунт)
create table public.status_places (
  user_id uuid primary key references public.statuses (user_id) on delete cascade,
  place text check (char_length(place) between 1 and 60),        -- станция отправления или дом отдыха
  dest text check (char_length(dest) between 1 and 60)           -- станция прибытия (только «в пути»)
);

-- Перенос: кто уже показывал статус, тот показывал его всем коллегам вместе со станциями — так и остаётся
insert into public.status_places (user_id, place, dest)
  select user_id, place, dest from public.statuses where place is not null or dest is not null;
update public.statuses set place = null, dest = null where place is not null or dest is not null;
insert into public.access (user_id, item) select user_id, 'status' from public.statuses;
insert into public.access (user_id, item) select user_id, 'place' from public.statuses;

-- ---------------------------------------------------------------- кто что видит (RLS)

-- Показывает ли owner вошедшему (коллеге) это. Работает от имени владельца базы: чужие правила
-- вошедший прочитать не может (их видит только хозяин), а проверить «мне можно?» — должен.
create function private.allowed(owner uuid, what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and owner <> auth.uid()
    and exists (select 1 from public.links l where l.state = 'accepted'
                and least(l.from_id, l.to_id) = least(owner, auth.uid()) and greatest(l.from_id, l.to_id) = greatest(owner, auth.uid()))
    and exists (select 1 from public.access a where a.user_id = owner and a.item = what
                and (a.viewer_id is null or a.viewer_id = auth.uid()))
$$;

alter table public.access enable row level security;
alter table public.status_places enable row level security;

create policy "свои правила" on public.access for select to authenticated using (user_id = auth.uid());

drop policy "свой статус и статусы коллег" on public.statuses;
create policy "свой статус и статус тех коллег, кто мне его показывает" on public.statuses for select to authenticated
  using (expires_at > now() and (user_id = auth.uid() or private.allowed(user_id, 'status')));

create policy "свои станции и станции тех коллег, кто мне их показывает" on public.status_places for select to authenticated
  using (exists (select 1 from public.statuses s where s.user_id = status_places.user_id and s.expires_at > now())
    and (user_id = auth.uid() or (private.allowed(user_id, 'status') and private.allowed(user_id, 'place'))));

revoke all on public.access, public.status_places from anon, authenticated;
grant select on public.access, public.status_places to authenticated;
-- правило доступа вызывает private.allowed от имени вошедшего: нужен только этот вызов, остальное в private закрыто
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.allowed(uuid, text) to authenticated;

-- Связь «коллеги» пропала (удалил, отклонил, вышел) — пропадают и разрешения между этими двумя.
-- Если снова станут коллегами, видеть друг друга заново разрешают сами.
create function private.forget_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.state <> 'accepted' then
    delete from public.access a
      where (a.user_id = old.from_id and a.viewer_id = old.to_id) or (a.user_id = old.to_id and a.viewer_id = old.from_id);
  end if;
  return null;
end $$;
create trigger links_forget_access after update or delete on public.links
  for each row when (old.state = 'accepted') execute function private.forget_access();

-- ---------------------------------------------------------------- для приложения (rpc)

-- Кому показывать: p_all — всем коллегам (и тем, кто появится), иначе только p_ids из моих коллег.
-- Ни того ни другого — никому. Убрать доступ можно всегда, дать — только с согласием.
create function public.set_access(p_item text, p_all boolean, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if p_item is null or p_item not in ('status', 'place') then raise exception 'cabina: bad item' using errcode = 'P0001'; end if;
  if coalesce(cardinality(p_ids), 0) > 500 then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  if coalesce(p_all, false) or coalesce(cardinality(p_ids), 0) > 0 then perform private.me(); end if;
  delete from public.access where user_id = u and item = p_item;
  if coalesce(p_all, false) then
    insert into public.access (user_id, item) values (u, p_item);
  elsif coalesce(cardinality(p_ids), 0) > 0 then
    insert into public.access (user_id, item, viewer_id)
      select distinct u, p_item, x from unnest(p_ids) x
      where x is not null and x <> u
        and exists (select 1 from public.links l where l.state = 'accepted' and l.id = private.pair(u, x));
  end if;
  -- никому не показываю — и хранить незачем
  if p_item = 'status' and not exists (select 1 from public.access where user_id = u and item = 'status') then
    delete from public.statuses where user_id = u;
  end if;
  if not exists (select 1 from public.access where user_id = u and item = 'place') then
    delete from public.status_places where user_id = u;
  end if;
end $$;

-- Текущий статус. Как раньше, плюс: никому не показываю статус — он не хранится; никому не показываю,
-- где я, — станции не хранятся.
create or replace function public.set_status(p_kind text, p_place text, p_dest text, p_part text, p_note text, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  pl text;
  ds text;
begin
  if p_kind is null or p_kind not in ('soon', 'trip', 'rest', 'wait', 'dayoff', 'between', 'abs') then
    raise exception 'cabina: bad status' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.links l where l.state = 'accepted' and u in (l.from_id, l.to_id))
     or not exists (select 1 from public.access a where a.user_id = u and a.item = 'status') then
    delete from public.statuses where user_id = u;
    return;
  end if;
  if p_until is not null and (p_until < now() - interval '1 day' or p_until > now() + interval '14 days') then p_until := null; end if;
  insert into public.statuses (user_id, kind, place, dest, part, note, until_at, after_kind, updated_at, expires_at)
  values (u, p_kind, null, null,
    case when p_kind in ('soon', 'trip') and p_part in ('morning', 'day', 'evening', 'night') then p_part end,
    case when p_kind = 'between' and p_note in ('queue', 'dayOff', 'full', 'fullOff') then p_note end,
    -- «скоро явка»: только начало части суток (без минут), чтобы коллега видел «завтра утром», а не точное время
    case when p_kind in ('rest', 'dayoff', 'between') then p_until when p_kind = 'soon' then date_trunc('hour', p_until) end,
    case when p_kind = 'rest' then 'wait' when p_kind = 'dayoff' then 'between' end,
    now(), now() + make_interval(hours => private.conf('status_hours')::int))
  on conflict (user_id) do update set kind = excluded.kind, place = null, dest = null, part = excluded.part,
    note = excluded.note, until_at = excluded.until_at, after_kind = excluded.after_kind,
    updated_at = excluded.updated_at, expires_at = excluded.expires_at;
  pl := case when p_kind in ('trip', 'rest', 'wait') then private.clean(p_place, 60) end;
  ds := case when p_kind = 'trip' then private.clean(p_dest, 60) end;
  if (pl is null and ds is null) or not exists (select 1 from public.access a where a.user_id = u and a.item = 'place') then
    delete from public.status_places where user_id = u;
  else
    insert into public.status_places (user_id, place, dest) values (u, pl, ds)
    on conflict (user_id) do update set place = excluded.place, dest = excluded.dest;
  end if;
end $$;

-- Выйти из «Коллег»: как раньше, и ещё свои правила «кому видно»
create or replace function public.leave_colleagues() returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  others uuid[];
  o uuid;
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  select coalesce(array_agg(case when from_id = u then to_id else from_id end), '{}') into others
    from public.links where u in (from_id, to_id) and (state <> 'declined' or to_id = u);
  delete from public.statuses where user_id = u;
  delete from public.links where u in (from_id, to_id) and (state <> 'declined' or to_id = u);
  delete from public.access where user_id = u;
  delete from public.cards where user_id = u;
  perform private.withdraw_publish(u);
  foreach o in array others loop perform private.tidy(o); end loop;
end $$;

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14): плюс станции статуса и правила «кому видно»
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', u.email,
    'email_confirmed', u.email_confirmed_at is not null,
    'created_on', p.created_on,
    'last_seen', p.last_seen,
    'platform', p.platform,
    'app_version', p.app_version,
    'consents', coalesce((select jsonb_agg(jsonb_build_object('document', c.document, 'given_at', c.given_at, 'withdrawn_at', c.withdrawn_at)
                          order by c.given_at) from public.consents c where c.user_id = u.id), '[]'::jsonb),
    'colleagues_card', (select to_jsonb(c) - 'user_id' from public.cards c where c.user_id = u.id),
    'colleagues_status', (select (to_jsonb(s) - 'user_id' - 'place' - 'dest') || jsonb_build_object('place', sp.place, 'dest', sp.dest)
                          from public.statuses s left join public.status_places sp on sp.user_id = s.user_id where s.user_id = u.id),
    'colleagues', coalesce((select jsonb_agg(jsonb_build_object(
        'with', case when l.from_id = u.id then l.to_id else l.from_id end,
        'state', l.state, 'offered_by_me', l.from_id = u.id, 'created_at', l.created_at, 'answered_at', l.answered_at) order by l.created_at)
      from public.links l where u.id in (l.from_id, l.to_id)), '[]'::jsonb),
    'colleagues_access', coalesce((select jsonb_agg(jsonb_build_object('item', a.item, 'to', coalesce(a.viewer_id::text, 'all')) order by a.item, a.created_at)
      from public.access a where a.user_id = u.id), '[]'::jsonb)
  )
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;

-- ---------------------------------------------------------------- права на функции

revoke all on function public.set_access(text, boolean, uuid[]) from public, anon;
grant execute on function public.set_access(text, boolean, uuid[]) to authenticated;

-- Сервер API (PostgREST) перечитывает список таблиц и функций
notify pgrst, 'reload schema';
