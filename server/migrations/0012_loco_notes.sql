-- CABINA, сервер, шаг 12 (2.31): заметки о локомотивах для коллег (просьба Никиты 11.11.2026).
--
-- Человек сам отмечает заметку «Показать коллегам» (по умолчанию — нет) и сам выбирает, кто из коллег их видит:
-- никто / все коллеги / выбранные (как статус, public.access, item = 'notes'). Коллега скачивает ВСЕ видимые ему
-- заметки целиком и ищет нужный локомотив у себя в телефоне — поэтому сервер не знает, на каком локомотиве кто едет сейчас.
-- Группы заметки НЕ открывают: только связь «коллеги» и правило доступа.
--
-- Что добавляется на сервер (решение Никиты 11.11.2026: номер локомотива — только у заметок, которыми поделились):
--   public.loco_notes      — серия и номер локомотива, текст (до 300 знаков), месяц (без дня и времени, без поездки и станций),
--                            сколько коллег отметили «Полезно». Хранится, пока автор ей делится (решение Никиты 11.11.2026:
--                            на локомотивах работают годами); стирается: автор убрал «Показать коллегам» или удалил заметку,
--                            никому не показывает заметки, вышел из «Коллег», удалил аккаунт.
--   public.loco_note_votes — кто отметил заметку «Полезно» (только «полезно»: «не помогло» остаётся в телефоне). Видит только
--                            сам отметивший; автор видит только число.
-- Новая редакция согласия privacy-5 (одна на шаги 11 и 12): в ней появились часы для коллег и заметки о локомотивах.
--
-- Применять сразу после 0011_hours.sql и одновременно с выпуском приложения 2.31: регистрация в старом приложении (privacy-4)
-- после применения не пройдёт. Функции, которые пересоздаёт и шаг 11 (set_access, export_my_data, cleanup_logs), здесь
-- написаны с учётом часов — поэтому порядок важен: сначала 0011, потом 0012.

update private.config set value = 'privacy-5' where key = 'consent_version';
insert into private.config (key, value) values
  ('notes_max', '200');           -- заметок, которыми человек делится

-- ---------------------------------------------------------------- таблицы

alter table public.access drop constraint access_item_check;
alter table public.access add constraint access_item_check check (item in ('status', 'place', 'hours', 'notes'));

create table public.loco_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,      -- автор
  note_key text not null check (char_length(note_key) between 1 and 40),   -- id заметки в телефоне автора
  loco_type text check (char_length(loco_type) between 1 and 20),          -- серия (может не быть)
  loco_num text not null check (char_length(loco_num) between 1 and 12),   -- номер
  body text not null check (char_length(body) between 1 and 300),
  month date not null check (extract(day from month) = 1),                 -- только месяц
  useful integer not null default 0 check (useful >= 0),
  unique (user_id, note_key)
);

create table public.loco_note_votes (
  note_id uuid not null references public.loco_notes (id) on delete cascade,
  voter uuid not null references auth.users (id) on delete cascade,
  primary key (note_id, voter)
);
create index loco_note_votes_voter on public.loco_note_votes (voter);

-- ---------------------------------------------------------------- кто что видит (RLS)

-- Показывает ли owner вошедшему свои заметки: только коллеге и только по правилу 'notes' (группы не в счёт)
create function private.notes_allowed(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and owner <> auth.uid()
    and exists (select 1 from public.links l where l.state = 'accepted'
                and least(l.from_id, l.to_id) = least(owner, auth.uid()) and greatest(l.from_id, l.to_id) = greatest(owner, auth.uid()))
    and exists (select 1 from public.access a where a.user_id = owner and a.item = 'notes'
                and (a.viewer_id is null or a.viewer_id = auth.uid()))
$$;

-- Делится ли человек заметками хоть с кем-то (есть коллеги и правило). Нет — заметки не храним.
create function private.shares_notes(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.links l where l.state = 'accepted' and u in (l.from_id, l.to_id))
     and exists (select 1 from public.access a where a.user_id = u and a.item = 'notes'
                 and (a.viewer_id is null or exists (select 1 from public.links l where l.state = 'accepted' and l.id = private.pair(u, a.viewer_id))))
$$;

alter table public.loco_notes enable row level security;
alter table public.loco_note_votes enable row level security;

create policy "свои заметки и заметки коллег, кто мне их показывает" on public.loco_notes for select to authenticated
  using (user_id = auth.uid() or private.notes_allowed(user_id));
create policy "свои отметки «полезно»" on public.loco_note_votes for select to authenticated using (voter = auth.uid());

revoke all on public.loco_notes, public.loco_note_votes from anon, authenticated;
grant select on public.loco_notes, public.loco_note_votes to authenticated;

-- Правила 'notes' пропали (никому, вышел из «Коллег», перестали быть коллегами с последним выбранным) — заметки стираются.
-- Проверяем в конце транзакции: set_access сначала удаляет правило, потом ставит новое.
create function private.forget_notes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.shares_notes(old.user_id) then delete from public.loco_notes where user_id = old.user_id; end if;
  return null;
end $$;
create constraint trigger access_forget_notes after delete on public.access deferrable initially deferred
  for each row when (old.item = 'notes') execute function private.forget_notes();

-- ---------------------------------------------------------------- для приложения (rpc)

-- Кому показывать: как в шаге 11 (статус, «где я», часы), и ещё 'notes' — заметки о локомотивах
create or replace function public.set_access(p_item text, p_all boolean, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if p_item is null or p_item not in ('status', 'place', 'hours', 'notes') then raise exception 'cabina: bad item' using errcode = 'P0001'; end if;
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

-- Мои заметки для коллег целиком: [{k, t, n, b, m: 'YYYY-MM'}]. Чего нет в списке — стирается (с отметками «полезно»).
-- Показывать некому — сервер не хранит ничего. Поменялся локомотив заметки — отметки «полезно» к ней стираются.
create function public.sync_loco_notes(p_notes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  x jsonb;
  k text; t text; n text; b text; m date;
  keys text[] := '{}';
  old_id uuid;
begin
  if p_notes is null or jsonb_typeof(p_notes) <> 'array' then raise exception 'cabina: bad notes' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_notes) > private.conf('notes_max')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  if not private.shares_notes(u) then
    delete from public.loco_notes where user_id = u;
    return;
  end if;
  for x in select * from jsonb_array_elements(p_notes) loop
    if jsonb_typeof(x) <> 'object' then continue; end if;
    k := private.clean(x ->> 'k', 40);
    t := private.clean(x ->> 't', 20);
    n := upper(private.clean(x ->> 'n', 12));
    b := private.clean(x ->> 'b', 300);
    m := case when (x ->> 'm') ~ '^\d{4}-(0[1-9]|1[0-2])$' then ((x ->> 'm') || '-01')::date end;
    if k is null or n is null or b is null or m is null or k = any(keys)
       or m > date_trunc('month', now())::date or m < date '2000-01-01' then continue; end if;
    keys := keys || k;
    select ln.id into old_id from public.loco_notes ln
      where ln.user_id = u and ln.note_key = k and (ln.loco_type is distinct from t or ln.loco_num <> n);
    if old_id is not null then delete from public.loco_notes where id = old_id; end if;  -- другой локомотив — оценки не переносим
    insert into public.loco_notes (user_id, note_key, loco_type, loco_num, body, month) values (u, k, t, n, b, m)
      on conflict (user_id, note_key) do update set body = excluded.body, month = excluded.month;
  end loop;
  delete from public.loco_notes where user_id = u and not (note_key = any(keys));
end $$;

-- «Полезно» (p_useful = true) или снять отметку (false). Только к заметке коллеги, который мне её показывает.
-- Возвращает, сколько теперь отметок у заметки.
create function public.rate_loco_note(p_id uuid, p_useful boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  owner uuid;
  c integer;
begin
  select user_id into owner from public.loco_notes where id = p_id for update;
  if owner is null or not private.notes_allowed(owner) then raise exception 'cabina: not found' using errcode = 'P0001'; end if;
  if coalesce(p_useful, false) then
    insert into public.loco_note_votes (note_id, voter) values (p_id, u) on conflict do nothing;
  else
    delete from public.loco_note_votes where note_id = p_id and voter = u;
  end if;
  update public.loco_notes set useful = (select count(*) from public.loco_note_votes v where v.note_id = p_id)
    where id = p_id returning useful into c;
  return c;
end $$;

-- ---------------------------------------------------------------- что сервер знает о человеке и очистка

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14): как в шаге 11 (с часами), плюс заметки и отметки «полезно»
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
        'show_status', m.show_status, 'show_place', m.show_place,
        'members', (select count(*) from public.group_members x where x.group_id = g.id)) order by m.joined_at)
      from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = u.id), '[]'::jsonb),
    'group_invites', coalesce((select jsonb_agg(jsonb_build_object('group', g.name, 'to_me', i.user_id = u.id, 'created_at', i.created_at) order by i.created_at)
      from public.group_invites i join public.groups g on g.id = i.group_id where u.id in (i.user_id, i.invited_by)), '[]'::jsonb),
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

-- Как в шаге 11 (с часами), плюс: заметки тех, кто ими больше ни с кем не делится
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
  delete from public.loco_notes n where not private.shares_notes(n.user_id);
  delete from private.limits where day < private.today() - 1;

  delete from private.invites where used_at is null and expires_at < now();
  delete from public.ideas where answered_at < now() - make_interval(days => private.conf('idea_keep_days')::int);
end $$;

-- ---------------------------------------------------------------- права на функции

revoke all on function private.notes_allowed(uuid), private.shares_notes(uuid), private.forget_notes() from public, anon, authenticated;
grant execute on function private.notes_allowed(uuid) to authenticated;   -- нужна правилу RLS (вызывается от имени вошедшего)
revoke all on function public.sync_loco_notes(jsonb), public.rate_loco_note(uuid, boolean) from public, anon;
grant execute on function public.sync_loco_notes(jsonb), public.rate_loco_note(uuid, boolean) to authenticated;
-- set_access, export_my_data, cleanup_logs пересозданы — права остались прежними

notify pgrst, 'reload schema';
