-- CABINA, сервер, шаг 10 (2.28): уведомления («колокольчик») — просьба показать статус, ответ и комментарий к идее.
--
-- 1. «Попросить показать статус» (public.status_asks). Коллега коллеге: «покажи мне свой статус». Просьба ничего не включает —
--    человек сам открывает выбор и сам ставит нужное (152-ФЗ, ст. 10.1). Сервер хранит только: кто, кого, когда и что человек
--    ответил («не сейчас» / «больше не просить»). Просьбу видит только тот, кого просят (RLS). Ограничения: только между коллегами,
--    не чаще раза в 7 дней одному и тому же, не больше 20 просьб в сутки; тому, кто выбрал «больше не просить», просьбы тихо
--    «отправляются» (прислать ему нельзя, а просящему об отказе не сообщаем). Пропадает, когда человек включил показ статуса просящему,
--    когда они перестали быть коллегами и через 30 дней (отметка «больше не просить» — пока они коллеги).
-- 2. Ответ на идею. К ответу администратора («принята» / «не подошла») добавляется короткий комментарий (до 300 знаков) — только от
--    администратора и только автору идеи; переписки нет: автор ответить комментарием не может. Автору приходит уведомление, пока он его
--    не открыл (ideas.seen_at). Уже отвеченные идеи помечаются прочитанными — старые ответы уведомлениями не станут.
--
-- Приложение 2.27 с этой миграцией работает как раньше. Приложение 2.28 без неё не показывает просьбы и комментарии.

-- ---------------------------------------------------------------- просьба показать статус

create table public.status_asks (
  asker uuid not null references auth.users (id) on delete cascade,     -- кто просит
  target uuid not null references auth.users (id) on delete cascade,    -- кого просят
  state text not null default 'open' check (state in ('open', 'dismissed', 'muted')),
  asked_at timestamptz not null default now(),
  primary key (asker, target),
  check (asker <> target)
);
create index status_asks_target on public.status_asks (target);

alter table public.status_asks enable row level security;
create policy "просьбы ко мне" on public.status_asks for select to authenticated using (target = auth.uid());
revoke all on public.status_asks from anon, authenticated;
grant select on public.status_asks to authenticated;

-- Попросить коллегу показать мне статус. Возвращает: sent / already (он уже показывает) / later (недавно просили)
create function public.ask_status(p_to uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  a public.status_asks;
begin
  if p_to is null or p_to = u
     or not exists (select 1 from public.links l where l.state = 'accepted' and l.id = private.pair(u, p_to)) then
    raise exception 'cabina: not found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.access x where x.user_id = p_to and x.item = 'status' and (x.viewer_id is null or x.viewer_id = u)) then
    return 'already';
  end if;
  select * into a from public.status_asks where asker = u and target = p_to for update;
  if found then
    if a.state = 'muted' then return 'sent'; end if;                       -- просить больше нельзя; просящему не сообщаем
    if a.asked_at > now() - interval '7 days' then return 'later'; end if;
  end if;
  if (select count(*) from public.status_asks where asker = u and asked_at > now() - interval '1 day') >= 20 then
    raise exception 'cabina: limit' using errcode = 'P0001';
  end if;
  insert into public.status_asks (asker, target) values (u, p_to)
    on conflict (asker, target) do update set state = 'open', asked_at = now();
  return 'sent';
end $$;

-- Ответить на просьбу: «не сейчас» (p_mute = false) или «больше не просить от него» (p_mute = true)
create function public.answer_status_ask(p_asker uuid, p_mute boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  update public.status_asks set state = case when coalesce(p_mute, false) then 'muted' else 'dismissed' end
    where asker = p_asker and target = u;
end $$;

-- Человек включил показ статуса просящему (или всем коллегам) — просьба выполнена
create function private.forget_asks_on_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.status_asks where target = new.user_id and (new.viewer_id is null or asker = new.viewer_id);
  return null;
end $$;
create trigger access_forget_asks after insert on public.access
  for each row when (new.item = 'status') execute function private.forget_asks_on_access();

-- Перестали быть коллегами — просьбы между ними стираются
create function private.forget_asks_on_unlink() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.state <> 'accepted' then
    delete from public.status_asks
      where (asker = old.from_id and target = old.to_id) or (asker = old.to_id and target = old.from_id);
  end if;
  return null;
end $$;
create trigger links_forget_asks after update or delete on public.links
  for each row when (old.state = 'accepted') execute function private.forget_asks_on_unlink();

-- ---------------------------------------------------------------- ответ и комментарий к идее

alter table public.ideas add column admin_note text check (admin_note is null or char_length(admin_note) between 1 and 300);
alter table public.ideas add column seen_at timestamptz;
-- что было отвечено раньше — уже «прочитано»
update public.ideas set seen_at = now() where answered_at is not null;

-- Администратор: принять / отклонить (p_accept не пусто) и/или оставить комментарий (p_note не пусто; пустая строка — стереть).
-- Любое изменение снова делает ответ «непрочитанным» для автора. Старый вызов (id, принять) работает как раньше.
drop function public.admin_answer_idea(uuid, boolean);
create function public.admin_answer_idea(p_id uuid, p_accept boolean default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n text := case when p_note is null then null else private.clean(p_note, 300) end;
begin
  if not private.is_admin() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  if p_accept is null and p_note is null then raise exception 'cabina: empty' using errcode = 'P0001'; end if;
  update public.ideas set
      state = case when p_accept is null then state when p_accept then 'accepted' else 'declined' end,
      answered_at = case when p_accept is null then answered_at else coalesce(answered_at, now()) end,
      admin_note = case when p_note is null then admin_note else nullif(n, '') end,
      seen_at = null
    where id = p_id;
  -- комментарий к ещё не отвеченной идее — это ещё не ответ: уведомлять автора рано
  update public.ideas set seen_at = now() where id = p_id and state = 'new';
end $$;

-- Автор открыл уведомления: все его отвеченные идеи прочитаны
create function public.mark_ideas_seen() returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  update public.ideas set seen_at = now() where user_id = u and seen_at is null;
end $$;

-- Идеи для администратора: как раньше (почта — только у идей с отметкой), плюс комментарий
create or replace function public.admin_ideas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'body', d.body, 'state', d.state,
      'created_at', d.created_at, 'answered_at', d.answered_at, 'note', d.admin_note,
      'email', case when d.reply_ok then (select u.email from auth.users u where u.id = d.user_id) end)
      order by d.state = 'new' desc, d.created_at desc)
    from (select * from public.ideas order by created_at desc limit 300) d), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- что сервер знает о человеке и очистка

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14): плюс комментарий к идее и просьбы о статусе
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

-- Как раньше, плюс: отвеченные просьбы о статусе старше 30 дней стираются
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
  delete from public.links where state = 'declined' and answered_at < now() - make_interval(days => private.conf('decline_days')::int);
  delete from public.links where state = 'pending' and created_at < now() - interval '30 days';
  delete from public.group_invites where created_at < now() - interval '30 days';
  delete from private.group_bans where at < now() - make_interval(days => private.conf('decline_days')::int);
  delete from public.statuses s where not private.shares(s.user_id, 'status');
  delete from public.status_places p where not private.shares(p.user_id, 'place');
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

revoke all on function private.forget_asks_on_access(), private.forget_asks_on_unlink() from public, anon, authenticated;
revoke all on function public.ask_status(uuid), public.answer_status_ask(uuid, boolean),
  public.admin_answer_idea(uuid, boolean, text), public.mark_ideas_seen() from public, anon;
grant execute on function public.ask_status(uuid), public.answer_status_ask(uuid, boolean),
  public.admin_answer_idea(uuid, boolean, text), public.mark_ideas_seen() to authenticated;
-- admin_ideas, export_my_data, cleanup_logs пересозданы — права остались прежними

notify pgrst, 'reload schema';
