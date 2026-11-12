-- CABINA, сервер, шаг 13 (2.33): поиск групп по названию (решения Никиты 12.11.2026).
--
-- Любую группу, которую администратор не убрал из поиска, пользователь CABINA с аккаунтом найдёт по названию.
-- В поиске видно ТОЛЬКО название и картинку: кто в группе, сколько их, кто администратор, статусы и станции чужой не видит.
-- Группа «открытая» (выбирает администратор, по умолчанию — нет) — вступить можно сразу; закрытая — по заявке:
-- администратор видит карточку заявителя (имя, должность и то, что он разрешил в «Приватности») и сам решает «Принять» / «Отклонить».
-- Код группы и приглашения работают как раньше.
--
-- Что добавляется на сервер:
--   public.groups.listed    — видна ли группа в поиске. У групп, которые уже есть, — нет (их создавали с обещанием «только по коду
--                             или приглашению»): администратор включает сам. Новой группе приложение ставит то, что выбрал
--                             администратор при создании (переключатель включён);
--   public.groups.open      — открытая ли группа (по умолчанию нет);
--   public.group_requests   — заявки: кто, в какую группу, когда; отклонённая хранится 30 дней (столько же нельзя подать
--                             заявку снова), заявка без ответа стирается через 30 дней, принятая — сразу;
--   private.limits          — плюс счётчики за день: поиски групп (30) и заявки / вступления из поиска (10).
-- Против перебора: искать можно только с аккаунтом и согласием, от 3 букв и цифр, не больше 10 результатов за раз и 30 поисков в день.
--
-- Кто что видит (RLS):
--   группу из поиска (название и картинку) — через find_groups; таблицу groups — как раньше, участники и приглашённые, и ещё тот,
--   кто подал в неё заявку (только чтобы видеть свою заявку);
--   заявку — сам заявитель и администратор этой группы;
--   карточку заявителя — ещё администратор группы, пока заявка ждёт ответа.
-- Новая редакция согласия privacy-6: в ней появились поиск групп и заявки. Кто принимал privacy-5, приложение попросит принять новую.
--
-- Применять одновременно с выпуском приложения 2.33: регистрация в старом приложении (privacy-5) после применения не пройдёт,
-- а 2.33 без этой миграции работает как раньше (поиска групп нет: «ещё не включён»).

update private.config set value = 'privacy-6' where key = 'consent_version';
insert into private.config (key, value) values
  ('group_search_per_day', '30'),   -- поисков открытых групп в день
  ('group_requests_per_day', '10'), -- заявок и вступлений из поиска в день
  ('group_requests_max', '50');     -- заявок без ответа в одной группе

alter table private.limits add column group_searches integer not null default 0;
alter table private.limits add column group_requests integer not null default 0;

-- ---------------------------------------------------------------- таблицы

alter table public.groups add column listed boolean not null default false;
alter table public.groups add column open boolean not null default false;

create table public.group_requests (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,      -- кто просится
  state text not null default 'pending' check (state in ('pending', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  primary key (group_id, user_id)
);
create index group_requests_user on public.group_requests (user_id);
alter table public.group_requests enable row level security;

-- ---------------------------------------------------------------- проверки для правил доступа

-- Подал ли вошедший заявку в эту группу (ждёт ответа или отклонена)
create function private.requested(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.group_requests where group_id = g and user_id = auth.uid())
$$;

-- Ждёт ли заявка этого человека ответа в группе, где вошедший — администратор
create function private.asks_me(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.group_requests r
    join public.group_members m on m.group_id = r.group_id and m.user_id = auth.uid() and m.role = 'admin'
    where r.user_id = other and r.state = 'pending')
$$;

drop policy "мои группы и приглашения" on public.groups;
create policy "мои группы, приглашения и заявки" on public.groups for select to authenticated
  using (private.in_group(id) or private.invited_to(id) or private.requested(id));

create policy "мои заявки и заявки в мои группы" on public.group_requests for select to authenticated
  using (user_id = auth.uid() or (state = 'pending' and private.group_admin(group_id, auth.uid())));

drop policy "карточки: своя, коллег, групп" on public.cards;
create policy "карточки: своя, коллег, групп, заявок" on public.cards for select to authenticated
  using (user_id = auth.uid() or private.group_mate(cards.user_id) or private.asks_me(cards.user_id) or exists (
    select 1 from public.links l
    where l.state in ('pending', 'accepted')
      and ((l.from_id = auth.uid() and l.to_id = cards.user_id) or (l.to_id = auth.uid() and l.from_id = cards.user_id))));

revoke all on public.group_requests from anon, authenticated;
grant select on public.group_requests to authenticated;

-- ---------------------------------------------------------------- служебное

-- Счётчик за день: как в шаге 7, плюс поиски групп и заявки
create or replace function private.spend(u uuid, what text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into private.limits (user_id, day) values (u, private.today()) on conflict do nothing;
  if what = 'search' then
    update private.limits set searches = searches + 1 where user_id = u and day = private.today() returning searches into n;
    if n > private.conf('search_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  elsif what = 'idea' then
    update private.limits set ideas = ideas + 1 where user_id = u and day = private.today() returning ideas into n;
    if n > private.conf('ideas_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  elsif what = 'group' then
    update private.limits set groups = groups + 1 where user_id = u and day = private.today() returning groups into n;
    if n > private.conf('groups_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  elsif what = 'group_try' then
    update private.limits set group_tries = group_tries + 1 where user_id = u and day = private.today() returning group_tries into n;
    if n > private.conf('group_tries_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  elsif what = 'group_invite' then
    update private.limits set group_invites = group_invites + 1 where user_id = u and day = private.today() returning group_invites into n;
    if n > private.conf('group_invites_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  elsif what = 'group_search' then
    update private.limits set group_searches = group_searches + 1 where user_id = u and day = private.today() returning group_searches into n;
    if n > private.conf('group_search_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  elsif what = 'group_request' then
    update private.limits set group_requests = group_requests + 1 where user_id = u and day = private.today() returning group_requests into n;
    if n > private.conf('group_requests_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  else
    update private.limits set offers = offers + 1 where user_id = u and day = private.today() returning offers into n;
    if n > private.conf('offers_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  end if;
end $$;

-- Как в шаге 11, плюс: карточка нужна, пока заявка ждёт ответа
create or replace function private.tidy(u uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.cards c where c.user_id = u and not c.searchable
    and not exists (select 1 from public.links l where l.state <> 'declined' and u in (l.from_id, l.to_id))
    and not exists (select 1 from public.group_members m where m.user_id = u)
    and not exists (select 1 from public.group_invites i where u in (i.user_id, i.invited_by))
    and not exists (select 1 from public.group_requests r where r.user_id = u and r.state = 'pending');
  delete from public.statuses s where s.user_id = u and not private.shares(u, 'status');
  delete from public.status_places p where p.user_id = u and not private.shares(u, 'place');
  delete from public.hours h where h.user_id = u and not private.shares(u, 'hours');
$$;

-- Вступил в группу любым путём (код, приглашение) — его заявка в эту группу больше не нужна
create function private.on_member_joined() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.group_requests where group_id = new.group_id and user_id = new.user_id;
  return null;
end $$;
create trigger group_members_joined after insert on public.group_members
  for each row execute function private.on_member_joined();

-- Название для поиска: как private.fold (строчные, «ё» → «е»), и ещё только буквы и цифры («ТД-64» и «тд64» — одно и то же)
create function private.fold_name(s text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(private.fold(s), '[^a-zа-я0-9]+', '', 'g')
$$;

-- ---------------------------------------------------------------- для приложения (rpc)

-- Видна ли группа в поиске и открытая ли она (администратор). Показать — с согласием, скрыть и закрыть — всегда.
-- Заявки без ответа остаются: администратор может ответить на них и потом.
create function public.set_group_search(p_group uuid, p_listed boolean, p_open boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  l boolean := coalesce(p_listed, false);
  o boolean := coalesce(p_open, false);
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if l or o then perform private.me(); end if;
  if not private.group_admin(p_group, u) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  update public.groups set listed = l, open = o where id = p_group;
end $$;

-- Поиск групп по названию: от 3 букв и цифр, не больше 10. Только название, картинка, открытая ли
-- и моё отношение к группе (я в ней / моя заявка ждёт / отклонена). Сколько участников и кто они — не отдаём.
create function public.find_groups(p_q text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  q text := private.fold_name(left(coalesce(p_q, ''), 60));
begin
  if char_length(q) < 3 then raise exception 'cabina: short query' using errcode = 'P0001'; end if;
  perform private.spend(u, 'group_search');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'pic', s.pic, 'open', s.open, 'me', s.me) order by s.k, s.name)
    from (
      select g.id, g.name, g.pic, g.open,
        case when exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = u) then 'member'
             else (select r.state from public.group_requests r where r.group_id = g.id and r.user_id = u) end as me,
        -- сначала названия, которые начинаются с запроса
        case when left(private.fold_name(g.name), char_length(q)) = q then 0 else 1 end as k
      from public.groups g
      where g.listed and strpos(private.fold_name(g.name), q) > 0
      order by k, g.name, g.id
      limit 10
    ) s), '[]'::jsonb);
end $$;

-- Вступить в группу из поиска. Открытая — сразу ('joined'), закрытая — заявка ждёт администратора ('sent');
-- уже в группе — 'member'. Исключённого и того, кому отказали, 30 дней не пускаем.
create function public.request_group(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  g public.groups;
  r public.group_requests;
begin
  select * into g from public.groups where id = p_group and listed;
  if not found then raise exception 'cabina: not found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = u) then return 'member'; end if;
  select * into r from public.group_requests where group_id = p_group and user_id = u for update;
  if found and r.state = 'pending' and not g.open then return 'sent'; end if;
  if (found and r.state = 'declined' and r.answered_at > now() - make_interval(days => private.conf('decline_days')::int))
     or exists (select 1 from private.group_bans where group_id = p_group and user_id = u
                and at > now() - make_interval(days => private.conf('decline_days')::int)) then
    raise exception 'cabina: later' using errcode = 'P0001';
  end if;
  perform private.need_card(u);
  perform private.spend(u, 'group_request');
  if g.open then
    perform private.room(u, p_group, false);
    insert into public.group_members (group_id, user_id) values (p_group, u);   -- заявку (если была) стирает триггер
    delete from public.group_invites where group_id = p_group and user_id = u;
    return 'joined';
  end if;
  perform private.room(u, p_group, true);
  if (select count(*) from public.group_requests where group_id = p_group and state = 'pending') >= private.conf('group_requests_max')::int then
    raise exception 'cabina: group full' using errcode = 'P0001';
  end if;
  insert into public.group_requests (group_id, user_id) values (p_group, u)
    on conflict (group_id, user_id) do update set state = 'pending', created_at = now(), answered_at = null;
  return 'sent';
end $$;

-- Отозвать свою заявку (ждёт ответа). Отклонённую не стираем: иначе можно было бы сразу подать снова.
create function public.cancel_group_request(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  delete from public.group_requests where group_id = p_group and user_id = u and state = 'pending';
  perform private.tidy(u);
end $$;

-- Ответ на заявку (администратор): принять — человек в группе; отклонить — 30 дней новую заявку подать нельзя.
create function public.answer_group_request(p_group uuid, p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if not private.group_admin(p_group, u) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.group_requests where group_id = p_group and user_id = p_user and state = 'pending') then
    raise exception 'cabina: not found' using errcode = 'P0001';
  end if;
  if coalesce(p_accept, false) then
    perform private.room(p_user, p_group, false);
    insert into public.group_members (group_id, user_id) values (p_group, p_user) on conflict do nothing; -- заявку стирает триггер
    delete from private.group_bans where group_id = p_group and user_id = p_user;
  else
    update public.group_requests set state = 'declined', answered_at = now() where group_id = p_group and user_id = p_user;
    perform private.tidy(p_user);
  end if;
end $$;

-- Выйти из «Коллег»: как в шаге 11, и заявки в группы тоже
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
  delete from public.group_requests where user_id = u;
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

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14): как в шаге 12, плюс видна ли группа в поиске, открытая ли она, и мои заявки
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
    'colleagues', coalesce((select jsonb_agg(jsonb_build_object(
        'with', case when l.from_id = u.id then l.to_id else l.from_id end,
        'state', l.state, 'offered_by_me', l.from_id = u.id, 'created_at', l.created_at, 'answered_at', l.answered_at) order by l.created_at)
      from public.links l where u.id in (l.from_id, l.to_id)), '[]'::jsonb),
    'colleagues_hours', (select to_jsonb(h) - 'user_id' from public.hours h where h.user_id = u.id),
    'colleagues_access', coalesce((select jsonb_agg(jsonb_build_object('item', a.item, 'to', coalesce(a.viewer_id::text, 'all')) order by a.item, a.created_at)
      from public.access a where a.user_id = u.id), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'role', m.role, 'joined_at', m.joined_at,
        'show_status', m.show_status, 'show_place', m.show_place, 'in_search', g.listed, 'open', g.open,
        'members', (select count(*) from public.group_members x where x.group_id = g.id)) order by m.joined_at)
      from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = u.id), '[]'::jsonb),
    'group_invites', coalesce((select jsonb_agg(jsonb_build_object('group', g.name, 'to_me', i.user_id = u.id, 'created_at', i.created_at) order by i.created_at)
      from public.group_invites i join public.groups g on g.id = i.group_id where u.id in (i.user_id, i.invited_by)), '[]'::jsonb),
    'group_requests', coalesce((select jsonb_agg(jsonb_build_object('group', g.name, 'state', r.state, 'created_at', r.created_at, 'answered_at', r.answered_at)
        order by r.created_at)
      from public.group_requests r join public.groups g on g.id = r.group_id where r.user_id = u.id), '[]'::jsonb),
    'status_asks', jsonb_build_object(
      'asked_by_me', coalesce((select jsonb_agg(jsonb_build_object('asked_at', s.asked_at) order by s.asked_at)
        from public.status_asks s where s.asker = u.id), '[]'::jsonb),
      'asked_me', coalesce((select jsonb_agg(jsonb_build_object('asked_at', s.asked_at, 'state', s.state) order by s.asked_at)
        from public.status_asks s where s.target = u.id), '[]'::jsonb)),
    'loco_notes', coalesce((select jsonb_agg(jsonb_build_object('loco_type', n.loco_type, 'loco_num', n.loco_num, 'body', n.body,
        'month', to_char(n.month, 'YYYY-MM'), 'useful', n.useful) order by n.month, n.loco_num)
      from public.loco_notes n where n.user_id = u.id), '[]'::jsonb),
    'loco_notes_marked_useful', (select count(*) from public.loco_note_votes v where v.voter = u.id)
  )
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;

-- Как в шаге 12, плюс: заявки без ответа старше 30 дней и отклонённые старше паузы; карточка нужна, пока заявка ждёт
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
  delete from public.group_requests where state = 'pending' and created_at < now() - interval '30 days';
  delete from public.group_requests where state = 'declined' and answered_at < now() - make_interval(days => private.conf('decline_days')::int);
  delete from private.group_bans where at < now() - make_interval(days => private.conf('decline_days')::int);
  delete from public.statuses s where not private.shares(s.user_id, 'status');
  delete from public.status_places p where not private.shares(p.user_id, 'place');
  delete from public.hours h where not private.shares(h.user_id, 'hours');
  delete from public.cards c where not c.searchable and c.updated_at < now() - interval '1 day'
    and not exists (select 1 from public.links l where l.state <> 'declined' and c.user_id in (l.from_id, l.to_id))
    and not exists (select 1 from public.group_members m where m.user_id = c.user_id)
    and not exists (select 1 from public.group_invites i where c.user_id in (i.user_id, i.invited_by))
    and not exists (select 1 from public.group_requests r where r.user_id = c.user_id and r.state = 'pending');
  delete from public.status_asks where state <> 'muted' and asked_at < now() - interval '30 days';
  delete from public.loco_notes n where not private.shares_notes(n.user_id);
  delete from private.limits where day < private.today() - 1;

  delete from private.invites where used_at is null and expires_at < now();
  delete from public.ideas where answered_at < now() - make_interval(days => private.conf('idea_keep_days')::int);
end $$;

-- ---------------------------------------------------------------- права на функции

revoke all on function private.requested(uuid), private.asks_me(uuid), private.on_member_joined(), private.fold_name(text)
  from public, anon, authenticated;
grant execute on function private.requested(uuid), private.asks_me(uuid) to authenticated;  -- нужны правилам RLS
revoke all on function public.set_group_search(uuid, boolean, boolean), public.find_groups(text), public.request_group(uuid),
  public.cancel_group_request(uuid), public.answer_group_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_group_search(uuid, boolean, boolean), public.find_groups(text), public.request_group(uuid),
  public.cancel_group_request(uuid), public.answer_group_request(uuid, uuid, boolean) to authenticated;
-- spend, tidy, leave_colleagues, export_my_data, cleanup_logs пересозданы — права остались прежними

notify pgrst, 'reload schema';
