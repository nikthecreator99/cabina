-- CABINA, сервер, шаг 11 (2.29): часы для коллег (просьба Никиты 11.11.2026: «чтобы я видел, сколько часов у моих коллег,
-- по их разрешению»).
--
-- Человек сам выбирает, кто из коллег видит его часы: никто (по умолчанию) / все коллеги / выбранные — так же, как статус (шаг 3).
-- Уходят только два числа: отработано минут в текущем месяце и итог прошлого месяца. Нормы, переработки, отвлечений,
-- заработка и поездок на сервере нет: по «отработано из нормы» видно отвлечения (больничный — сведения о здоровье).
-- Группам часы не показываются: только коллегам.
--
--   public.hours  — одна строка на человека: месяц ('YYYY-MM'), минуты за него, минуты прошлого месяца, когда обновлено;
--                   без истории; стирается через 7 дней без обновления, когда показывать некому и при выходе из «Коллег».
--   public.access — правило «кому видно» теперь бывает и для 'hours'.
--
-- Новая редакция согласия privacy-5: в перечне данных появились отработанные часы. Кто принимал privacy-4, приложение
-- попросит принять новую. Применять одновременно с выпуском приложения 2.29: регистрация в старом приложении (privacy-4)
-- после применения не пройдёт, а 2.29 без этой миграции пишет «часы на сервере ещё не включены» и работает как 2.28.

update private.config set value = 'privacy-5' where key = 'consent_version';
insert into private.config (key, value) values
  ('hours_days', '7'); -- через сколько дней без обновления часы коллеге больше не видны и стираются

-- ---------------------------------------------------------------- таблица

alter table public.access drop constraint access_item_check;
alter table public.access add constraint access_item_check check (item in ('status', 'place', 'hours'));

create table public.hours (
  user_id uuid primary key references auth.users (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- месяц, к которому относятся cur_min
  cur_min integer not null check (cur_min between 0 and 44640),      -- отработано минут в этом месяце (не больше 31 суток)
  prev_min integer check (prev_min between 0 and 44640),             -- итог прошлого месяца
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------- кто что видит (RLS)

-- Показывает ли owner вошедшему это: 'status', 'place' — как в шаге 9 (коллеге по правилу, участнику группы — взаимно);
-- 'hours' — только коллеге по правилу «кому видно», группам — никогда.
create or replace function private.allowed(owner uuid, what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and owner <> auth.uid() and (
    (exists (select 1 from public.links l where l.state = 'accepted'
             and least(l.from_id, l.to_id) = least(owner, auth.uid()) and greatest(l.from_id, l.to_id) = greatest(owner, auth.uid()))
     and exists (select 1 from public.access a where a.user_id = owner and a.item = what
                 and (a.viewer_id is null or a.viewer_id = auth.uid())))
    or (what in ('status', 'place')
        and exists (select 1 from public.group_members o join public.group_members v on v.group_id = o.group_id and v.user_id = auth.uid()
                    where o.user_id = owner and o.show_status and v.show_status
                      and (what = 'status' or (o.show_place and v.show_place)))))
$$;

alter table public.hours enable row level security;
create policy "свои часы и часы коллег, которым разрешено" on public.hours for select to authenticated
  using (user_id = auth.uid() or (expires_at > now() and private.allowed(user_id, 'hours')));
revoke all on public.hours from anon, authenticated;
grant select on public.hours to authenticated;

-- ---------------------------------------------------------------- служебное

-- Показывает ли человек кому-нибудь это. Группы — только для статуса и «где я», не для часов.
create or replace function private.shares(u uuid, what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exists (select 1 from public.links l where l.state = 'accepted' and u in (l.from_id, l.to_id))
          and exists (select 1 from public.access a where a.user_id = u and a.item = what))
    or (what in ('status', 'place')
        and exists (select 1 from public.group_members m
                    where m.user_id = u and (case when what = 'place' then m.show_place else m.show_status end)
                      and exists (select 1 from public.group_members x where x.group_id = m.group_id and x.user_id <> u)))
$$;

-- Как раньше (шаг 7), плюс часы: показывать некому — не храним
create or replace function private.tidy(u uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.cards c where c.user_id = u and not c.searchable
    and not exists (select 1 from public.links l where l.state <> 'declined' and u in (l.from_id, l.to_id))
    and not exists (select 1 from public.group_members m where m.user_id = u)
    and not exists (select 1 from public.group_invites i where u in (i.user_id, i.invited_by));
  delete from public.statuses s where s.user_id = u and not private.shares(u, 'status');
  delete from public.status_places p where p.user_id = u and not private.shares(u, 'place');
  delete from public.hours h where h.user_id = u and not private.shares(u, 'hours');
$$;

-- ---------------------------------------------------------------- для приложения (rpc)

-- Кому показывать: как раньше (шаг 7), и ещё 'hours'. Никому — часы сразу стираются.
create or replace function public.set_access(p_item text, p_all boolean, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if p_item is null or p_item not in ('status', 'place', 'hours') then raise exception 'cabina: bad item' using errcode = 'P0001'; end if;
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
  if not private.shares(u, 'status') then delete from public.statuses where user_id = u; end if;
  if not private.shares(u, 'place') then delete from public.status_places where user_id = u; end if;
  if not private.shares(u, 'hours') then delete from public.hours where user_id = u; end if;
end $$;

-- Мои часы: месяц ('YYYY-MM' — текущий по часам человека, поэтому допускается соседний с сегодняшним по UTC),
-- минуты за него и итог прошлого месяца. Показывать некому — не храним.
create function public.set_hours(p_month text, p_cur integer, p_prev integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  t timestamp := now() at time zone 'utc';
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     or p_month not in (to_char(t - interval '1 day', 'YYYY-MM'), to_char(t + interval '1 day', 'YYYY-MM')) then
    raise exception 'cabina: bad month' using errcode = 'P0001';
  end if;
  if p_cur is null or p_cur < 0 or p_cur > 44640 or (p_prev is not null and (p_prev < 0 or p_prev > 44640)) then
    raise exception 'cabina: bad hours' using errcode = 'P0001';
  end if;
  if not private.shares(u, 'hours') then
    delete from public.hours where user_id = u;
    return;
  end if;
  insert into public.hours (user_id, month, cur_min, prev_min, updated_at, expires_at)
  values (u, p_month, p_cur, p_prev, now(), now() + make_interval(days => private.conf('hours_days')::int))
  on conflict (user_id) do update set month = excluded.month, cur_min = excluded.cur_min, prev_min = excluded.prev_min,
    updated_at = excluded.updated_at, expires_at = excluded.expires_at;
end $$;

-- Выйти из «Коллег»: как раньше (шаг 7), и часы тоже
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
  delete from public.group_invites where u in (user_id, invited_by);
  delete from public.group_members where user_id = u;
  delete from private.group_bans where user_id = u;
  delete from public.statuses where user_id = u;
  delete from public.hours where user_id = u;
  delete from public.links where u in (from_id, to_id) and (state <> 'declined' or to_id = u);
  delete from public.access where user_id = u;
  delete from public.cards where user_id = u;
  perform private.withdraw_publish(u);
  foreach o in array others loop perform private.tidy(o); end loop;
end $$;

-- ---------------------------------------------------------------- что сервер знает о человеке и очистка

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14): как в шаге 10, плюс часы для коллег
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', u.email,
    'email_confirmed', u.email_confirmed_at is not null,
    'created_on', p.created_on,
    'last_seen', p.last_seen,
    'active_days', p.active_days,
    'platform', p.platform,
    'app_version', p.app_version,
    'consents', coalesce((select jsonb_agg(jsonb_build_object('document', c.document, 'given_at', c.given_at, 'withdrawn_at', c.withdrawn_at)
                          order by c.given_at) from public.consents c where c.user_id = u.id), '[]'::jsonb),
    'invited_by', (select coalesce(i.created_by::text, 'admin') from private.invites i where i.used_by = u.id limit 1),
    'invites', jsonb_build_object(
      'open', coalesce((select jsonb_agg(jsonb_build_object('created_at', i.created_at, 'expires_at', i.expires_at) order by i.created_at)
               from private.invites i where i.created_by = u.id and i.used_at is null), '[]'::jsonb),
      'joined', (select count(*) from private.invites i where i.created_by = u.id and i.used_at is not null),
      'counted', private.invites_counted(u.id)),
    'ideas', coalesce((select jsonb_agg(jsonb_build_object('body', d.body, 'state', d.state, 'created_at', d.created_at, 'answered_at', d.answered_at,
                 'reply_by_email', d.reply_ok, 'comment', d.admin_note)
               order by d.created_at) from public.ideas d where d.user_id = u.id), '[]'::jsonb),
    'colleagues_card', (select to_jsonb(c) - 'user_id' from public.cards c where c.user_id = u.id),
    'colleagues_status', (select (to_jsonb(s) - 'user_id' - 'place' - 'dest') || jsonb_build_object('place', sp.place, 'dest', sp.dest)
                          from public.statuses s left join public.status_places sp on sp.user_id = s.user_id where s.user_id = u.id),
    'colleagues_hours', (select to_jsonb(h) - 'user_id' from public.hours h where h.user_id = u.id),
    'colleagues', coalesce((select jsonb_agg(jsonb_build_object(
        'with', case when l.from_id = u.id then l.to_id else l.from_id end,
        'state', l.state, 'offered_by_me', l.from_id = u.id, 'created_at', l.created_at, 'answered_at', l.answered_at) order by l.created_at)
      from public.links l where u.id in (l.from_id, l.to_id)), '[]'::jsonb),
    'colleagues_access', coalesce((select jsonb_agg(jsonb_build_object('item', a.item, 'to', coalesce(a.viewer_id::text, 'all')) order by a.item, a.created_at)
      from public.access a where a.user_id = u.id), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'role', m.role, 'joined_at', m.joined_at,
        'show_status', m.show_status, 'show_place', m.show_place,
        'members', (select count(*) from public.group_members x where x.group_id = g.id)) order by m.joined_at)
      from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = u.id), '[]'::jsonb),
    'group_invites', coalesce((select jsonb_agg(jsonb_build_object('group', g.name, 'to_me', i.user_id = u.id, 'created_at', i.created_at) order by i.created_at)
      from public.group_invites i join public.groups g on g.id = i.group_id where u.id in (i.user_id, i.invited_by)), '[]'::jsonb),
    'status_asks', jsonb_build_object(
      'asked_by_me', coalesce((select jsonb_agg(jsonb_build_object('asked_at', s.asked_at) order by s.asked_at)
        from public.status_asks s where s.asker = u.id), '[]'::jsonb),
      'asked_me', coalesce((select jsonb_agg(jsonb_build_object('asked_at', s.asked_at, 'state', s.state) order by s.asked_at)
        from public.status_asks s where s.target = u.id), '[]'::jsonb))
  )
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;

-- Как в шаге 10, плюс: часы без обновления дольше 7 дней и часы, которые некому показывать, стираются
create or replace function private.cleanup_logs() returns void
language plpgsql security definer set search_path = '' as $$
declare
  keep interval := make_interval(days => private.conf('log_days')::int);
begin
  delete from auth.audit_log_entries where created_at < now() - keep;
  if exists (select 1 from information_schema.columns
             where table_schema = 'auth' and table_name = 'sessions' and column_name = 'ip') then
    execute 'update auth.sessions set ip = null, user_agent = null where created_at < $1 and (ip is not null or user_agent is not null)'
      using now() - keep;
  end if;

  delete from public.statuses where expires_at <= now();
  delete from public.hours where expires_at <= now();
  delete from public.links where state = 'declined' and answered_at < now() - make_interval(days => private.conf('decline_days')::int);
  delete from public.links where state = 'pending' and created_at < now() - interval '30 days';
  delete from public.group_invites where created_at < now() - interval '30 days';
  delete from private.group_bans where at < now() - make_interval(days => private.conf('decline_days')::int);
  delete from public.statuses s where not private.shares(s.user_id, 'status');
  delete from public.status_places p where not private.shares(p.user_id, 'place');
  delete from public.hours h where not private.shares(h.user_id, 'hours');
  delete from public.cards c where not c.searchable and c.updated_at < now() - interval '1 day'
    and not exists (select 1 from public.links l where l.state <> 'declined' and c.user_id in (l.from_id, l.to_id))
    and not exists (select 1 from public.group_members m where m.user_id = c.user_id)
    and not exists (select 1 from public.group_invites i where c.user_id in (i.user_id, i.invited_by));
  delete from public.status_asks where state <> 'muted' and asked_at < now() - interval '30 days';
  delete from private.limits where day < private.today() - 1;

  delete from private.invites where used_at is null and expires_at < now();
  delete from public.ideas where answered_at < now() - make_interval(days => private.conf('idea_keep_days')::int);
end $$;

-- ---------------------------------------------------------------- права на функции

revoke all on function public.set_hours(text, integer, integer) from public, anon;
grant execute on function public.set_hours(text, integer, integer) to authenticated;
-- allowed, shares, tidy, set_access, leave_colleagues, export_my_data, cleanup_logs пересозданы — права остались прежними

notify pgrst, 'reload schema';
