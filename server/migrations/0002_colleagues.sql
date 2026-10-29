-- CABINA, сервер, шаг 2: «Коллеги» — поиск коллег, предложение стать коллегами, статус для коллег.
--
-- Что добавляется на сервер (и только если человек сам включил это в приложении):
--   public.cards     — карточка: имя, должность, депо и персонаж (набор деталей, не фото), «меня можно найти»;
--   public.links     — предложения «стать коллегами» и связи между двумя аккаунтами;
--   public.statuses  — одна строка текущего статуса (в пути, на отдыхе…), без истории; сама стирается через 48 часов;
--   private.limits   — счётчики за день (поиски и предложения), чтобы никто не собрал список людей депо;
--   public.consents  — плюс отдельное согласие на распространение (publish-1): без него человека нет в поиске,
--                      выключил «меня можно найти» — согласие отозвано (withdrawn_at), карточка из поиска пропала.
-- Поездки, заработок, отвлечения и их причины, номер поезда и локомотива, точное время явки и телефон сюда не попадают.
--
-- Кто что видит (правила базы, RLS):
--   карточку — сам человек и те, с кем есть предложение или связь «коллеги»; в поиске — только если «меня можно найти»;
--   статус — сам человек и его коллеги (кто принял предложение), пока он не устарел;
--   предложения и связи — только те двое, между кем они; отклонённые не видит никто (они нужны серверу для паузы).
-- Писать в таблицы приложение может только через функции ниже.

-- Новая редакция согласия: в ней появились данные раздела «Коллеги».
update private.config set value = 'privacy-2' where key = 'consent_version';
-- Быть в поиске = показывать имя и выбранное всем пользователям CABINA. По 152-ФЗ (ст. 10.1) это распространение:
-- на него нужно отдельное согласие, его можно отозвать одним переключателем.
insert into private.config (key, value) values
  ('publish_version', 'publish-1'),
  ('status_hours', '48'),    -- через сколько часов без обновления статус перестаёт быть виден и стирается
  ('search_per_day', '100'), -- поисков в день на одного человека
  ('offers_per_day', '10'),  -- предложений «стать коллегами» в день
  ('offers_pending', '30'),  -- сколько предложений может одновременно ждать ответа
  ('decline_days', '30');    -- пауза после «Отклонить» или «Удалить из коллег»

-- ---------------------------------------------------------------- таблицы

-- Отозванное согласие не удаляем, а отмечаем: так видно, когда оно действовало
alter table public.consents add column withdrawn_at timestamptz;

create table public.cards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  role text check (role in ('assistant', 'driver', 'other')),
  depot text check (char_length(depot) between 1 and 60),
  avatar jsonb check (avatar is null or (jsonb_typeof(avatar) = 'object' and length(avatar::text) <= 2000)),
  searchable boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (from_id <> to_id)
);
-- Между двумя людьми — одна запись, в какую сторону ни отправляли
create unique index links_pair on public.links (least(from_id, to_id), greatest(from_id, to_id));
create index links_from on public.links (from_id);
create index links_to on public.links (to_id);

create table public.statuses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kind text not null check (kind in ('soon', 'trip', 'rest', 'wait', 'dayoff', 'between', 'abs')),
  place text check (char_length(place) between 1 and 60),        -- станция отправления или дом отдыха
  dest text check (char_length(dest) between 1 and 60),          -- станция прибытия (только «в пути»)
  part text check (part in ('morning', 'day', 'evening', 'night')), -- часть суток вместо точного времени явки
  note text check (note in ('queue', 'dayOff', 'full', 'fullOff')), -- какой отдых дома (только «между поездками»)
  until_at timestamptz,                                          -- до какого времени отдых или выходной; у «скоро явка» — начало части суток
  after_kind text check (after_kind in ('wait', 'between')),    -- что показать, когда отдых или выходной закончился
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table private.limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  searches integer not null default 0,
  offers integer not null default 0,
  primary key (user_id, day)
);

alter table public.cards enable row level security;
alter table public.links enable row level security;
alter table public.statuses enable row level security;
alter table private.limits enable row level security;

create policy "мои предложения и связи" on public.links for select to authenticated
  using (state <> 'declined' and auth.uid() in (from_id, to_id));

create policy "своя карточка и тех, с кем есть предложение или связь" on public.cards for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.links l
    where l.state in ('pending', 'accepted')
      and ((l.from_id = auth.uid() and l.to_id = cards.user_id) or (l.to_id = auth.uid() and l.from_id = cards.user_id))));

create policy "свой статус и статусы коллег" on public.statuses for select to authenticated
  using (expires_at > now() and (user_id = auth.uid() or exists (
    select 1 from public.links l
    where l.state = 'accepted'
      and ((l.from_id = auth.uid() and l.to_id = statuses.user_id) or (l.to_id = auth.uid() and l.from_id = statuses.user_id)))));

revoke all on public.cards, public.links, public.statuses from anon, authenticated;
revoke all on private.limits from anon, authenticated;
grant select on public.cards, public.links, public.statuses to authenticated;

-- ---------------------------------------------------------------- служебное

-- Для поиска: строчные буквы, «ё» = «е». Русские буквы переводим сами, чтобы поиск не зависел от настроек базы.
create function private.fold(s text) returns text
language sql immutable set search_path = '' as $$
  select lower(translate(coalesce(s, ''), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯё', 'абвгдеежзийклмнопрстуфхцчшщъыьэюяе'))
$$;

-- Текст от приложения: без служебных символов и лишних пробелов, не длиннее max; пустой — null
create function private.clean(s text, max int) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(left(btrim(regexp_replace(coalesce(s, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), max)), '')
$$;

create function private.has_consent(u uuid, doc text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consents where user_id = u and withdrawn_at is null
                 and document = coalesce(doc, private.conf('consent_version')))
$$;

-- Вошедший человек, принявший согласие текущей редакции. Без согласия новые данные не собираются.
create function private.me() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if not private.has_consent(u) then raise exception 'cabina: consent required' using errcode = 'P0001'; end if;
  return u;
end $$;

create function private.pair(a uuid, b uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.links where least(from_id, to_id) = least(a, b) and greatest(from_id, to_id) = greatest(a, b)
$$;

-- Счётчик за день: превысил — отказ (и сама попытка тоже не засчитывается: всё откатывается)
create function private.spend(u uuid, what text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into private.limits (user_id, day) values (u, private.today()) on conflict do nothing;
  if what = 'search' then
    update private.limits set searches = searches + 1 where user_id = u and day = private.today() returning searches into n;
    if n > private.conf('search_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  else
    update private.limits set offers = offers + 1 where user_id = u and day = private.today() returning offers into n;
    if n > private.conf('offers_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  end if;
end $$;

-- Лишнее не храним: карточка без «меня можно найти» и без предложений и связей не нужна,
-- статус без коллег никто не видит.
create function private.tidy(u uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.cards c where c.user_id = u and not c.searchable
    and not exists (select 1 from public.links l where l.state <> 'declined' and u in (l.from_id, l.to_id));
  delete from public.statuses s where s.user_id = u
    and not exists (select 1 from public.links l where l.state = 'accepted' and u in (l.from_id, l.to_id));
$$;

-- ---------------------------------------------------------------- для приложения (rpc)

-- Отдельной кнопкой «Даю согласие»: новая редакция для тех, кто зарегистрировался раньше,
-- или согласие на распространение (для «меня можно найти»; сначала нужно основное согласие)
create function public.give_consent(p_document text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if p_document = private.conf('publish_version') then perform private.me();
  elsif p_document is distinct from private.conf('consent_version') then raise exception 'cabina: consent required' using errcode = 'P0001';
  end if;
  if not private.has_consent(u, p_document) then insert into public.consents (user_id, document) values (u, p_document); end if;
end $$;

-- Выключил «меня можно найти» или вышел из «Коллег» — согласие на распространение отозвано
create function private.withdraw_publish(u uuid) returns void
language sql security definer set search_path = '' as $$
  update public.consents set withdrawn_at = now()
    where user_id = u and document = private.conf('publish_version') and withdrawn_at is null
$$;

-- Своя карточка. Что в неё попадёт (депо, персонаж), решает человек в «Приватности»; телефон сюда не попадает никогда.
create function public.save_card(p_name text, p_role text, p_depot text, p_avatar jsonb, p_searchable boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  n text := private.clean(p_name, 60);
begin
  if n is null then raise exception 'cabina: name required' using errcode = 'P0001'; end if;
  if coalesce(p_searchable, false) and not private.has_consent(u, private.conf('publish_version')) then
    raise exception 'cabina: publish consent required' using errcode = 'P0001';
  end if;
  if not coalesce(p_searchable, false) then perform private.withdraw_publish(u); end if;
  if p_avatar is not null and (jsonb_typeof(p_avatar) <> 'object' or length(p_avatar::text) > 2000
      or exists (select 1 from jsonb_each(p_avatar) e where jsonb_typeof(e.value) = 'object')) then
    p_avatar := null;
  end if;
  insert into public.cards (user_id, name, role, depot, avatar, searchable, updated_at)
  values (u, n, case when p_role in ('assistant', 'driver', 'other') then p_role end, private.clean(p_depot, 60),
          p_avatar, coalesce(p_searchable, false), now())
  on conflict (user_id) do update set name = excluded.name, role = excluded.role, depot = excluded.depot,
    avatar = excluded.avatar, searchable = excluded.searchable, updated_at = now();
end $$;

-- Поиск: только те, кто включил «меня можно найти»; имя — от 3 букв; не больше 20 человек; не больше 100 поисков в день.
create function public.find_colleagues(p_name text, p_depot text default null, p_role text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  q text := private.fold(private.clean(p_name, 60));
  d text := private.fold(private.clean(p_depot, 60));
begin
  if char_length(regexp_replace(q, '[^a-zа-я0-9]', '', 'g')) < 3 then
    raise exception 'cabina: name too short' using errcode = 'P0001';
  end if;
  perform private.spend(u, 'search');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.user_id, 'name', c.name, 'role', c.role, 'depot', c.depot, 'avatar', c.avatar) order by c.name)
    from (select * from public.cards x
          where x.searchable and x.user_id <> u
            and position(q in private.fold(x.name)) > 0
            and (d = '' or position(d in private.fold(x.depot)) > 0)
            and (p_role is null or x.role = p_role)
          order by x.name limit 20) c), '[]'::jsonb);
end $$;

-- Предложить стать коллегами. Ответ: 'sent' — отправлено, 'accepted' — он уже предлагал мне, теперь мы коллеги,
-- 'already' — уже коллеги.
create function public.offer_colleague(p_to uuid) returns text
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
  -- найти и позвать можно только того, кто сам разрешил себя находить (иначе — как будто его нет)
  if not exists (select 1 from public.cards where user_id = p_to and searchable) then
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

-- Ответ на предложение, которое прислали мне
create function public.answer_colleague(p_from uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
begin
  if p_accept and not exists (select 1 from public.cards where user_id = u) then
    raise exception 'cabina: name required' using errcode = 'P0001';
  end if;
  update public.links set state = case when p_accept then 'accepted' else 'declined' end, answered_at = now()
    where from_id = p_from and to_id = u and state = 'pending';
  if not found then raise exception 'cabina: not found' using errcode = 'P0001'; end if;
  if not p_accept then perform private.tidy(u); perform private.tidy(p_from); end if;
end $$;

-- Отменить своё предложение, отклонить чужое или удалить из коллег. Удалённый больше ничего не видит
-- и 30 дней не может прислать новое предложение. Согласие не нужно: убрать своё можно всегда.
create function public.drop_colleague(p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  l public.links;
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  select * into l from public.links where id = private.pair(u, p_other) for update;
  if not found or l.state = 'declined' then return; end if;
  if l.state = 'pending' and l.from_id = u then
    delete from public.links where id = l.id;
  else
    update public.links set state = 'declined', from_id = p_other, to_id = u, answered_at = now() where id = l.id;
  end if;
  perform private.tidy(u);
  perform private.tidy(p_other);
end $$;

-- Текущий статус. Сервер сам решает, что из присланного сохранить для каждого вида статуса,
-- и ничего не хранит, если у человека нет коллег.
create function public.set_status(p_kind text, p_place text, p_dest text, p_part text, p_note text, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
begin
  if p_kind is null or p_kind not in ('soon', 'trip', 'rest', 'wait', 'dayoff', 'between', 'abs') then
    raise exception 'cabina: bad status' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.links l where l.state = 'accepted' and u in (l.from_id, l.to_id)) then
    delete from public.statuses where user_id = u;
    return;
  end if;
  if p_until is not null and (p_until < now() - interval '1 day' or p_until > now() + interval '14 days') then p_until := null; end if;
  insert into public.statuses (user_id, kind, place, dest, part, note, until_at, after_kind, updated_at, expires_at)
  values (u, p_kind,
    case when p_kind in ('trip', 'rest', 'wait') then private.clean(p_place, 60) end,
    case when p_kind = 'trip' then private.clean(p_dest, 60) end,
    case when p_kind in ('soon', 'trip') and p_part in ('morning', 'day', 'evening', 'night') then p_part end,
    case when p_kind = 'between' and p_note in ('queue', 'dayOff', 'full', 'fullOff') then p_note end,
    -- «скоро явка»: только начало части суток (без минут), чтобы коллега видел «завтра утром», а не точное время
    case when p_kind in ('rest', 'dayoff', 'between') then p_until when p_kind = 'soon' then date_trunc('hour', p_until) end,
    case when p_kind = 'rest' then 'wait' when p_kind = 'dayoff' then 'between' end,
    now(), now() + make_interval(hours => private.conf('status_hours')::int))
  on conflict (user_id) do update set kind = excluded.kind, place = excluded.place, dest = excluded.dest, part = excluded.part,
    note = excluded.note, until_at = excluded.until_at, after_kind = excluded.after_kind,
    updated_at = excluded.updated_at, expires_at = excluded.expires_at;
end $$;

-- Выключили «Показывать статус» (или вышли из аккаунта) — статус стирается сразу
create function public.clear_status() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  delete from public.statuses where user_id = auth.uid();
end $$;

-- Выйти из «Коллег»: стереть свою карточку, статус, предложения и связи. Остаются только отметки
-- «вам отказали» (их стирает срок паузы) и счётчики за сегодня — чтобы этим нельзя было обойти ограничения.
create function public.leave_colleagues() returns void
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
  delete from public.cards where user_id = u;
  perform private.withdraw_publish(u);
  foreach o in array others loop perform private.tidy(o); end loop;
end $$;

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14), теперь и про «Коллег»
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
    'colleagues_status', (select to_jsonb(s) - 'user_id' from public.statuses s where s.user_id = u.id),
    'colleagues', coalesce((select jsonb_agg(jsonb_build_object(
        'with', case when l.from_id = u.id then l.to_id else l.from_id end,
        'state', l.state, 'offered_by_me', l.from_id = u.id, 'created_at', l.created_at, 'answered_at', l.answered_at) order by l.created_at)
      from public.links l where u.id in (l.from_id, l.to_id)), '[]'::jsonb)
  )
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;

-- ---------------------------------------------------------------- ежедневная очистка

-- Вызывается раз в сутки расписанием на сервере (/etc/cron.d/cabina-cleanup). К журналам входа добавилось:
-- устаревшие статусы, отказы старше паузы, предложения без ответа старше 30 дней, ненужные карточки, старые счётчики.
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
  delete from public.statuses s where not exists (
    select 1 from public.links l where l.state = 'accepted' and s.user_id in (l.from_id, l.to_id));
  delete from public.cards c where not c.searchable and c.updated_at < now() - interval '1 day'
    and not exists (select 1 from public.links l where l.state <> 'declined' and c.user_id in (l.from_id, l.to_id));
  delete from private.limits where day < private.today() - 1;
end $$;

-- ---------------------------------------------------------------- права на функции

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.give_consent(text), public.save_card(text, text, text, jsonb, boolean),
  public.find_colleagues(text, text, text), public.offer_colleague(uuid), public.answer_colleague(uuid, boolean),
  public.drop_colleague(uuid), public.set_status(text, text, text, text, text, timestamptz), public.clear_status(),
  public.leave_colleagues(), public.export_my_data() from public, anon;
grant execute on function public.give_consent(text), public.save_card(text, text, text, jsonb, boolean),
  public.find_colleagues(text, text, text), public.offer_colleague(uuid), public.answer_colleague(uuid, boolean),
  public.drop_colleague(uuid), public.set_status(text, text, text, text, text, timestamptz), public.clear_status(),
  public.leave_colleagues(), public.export_my_data() to authenticated;

-- Сервер API (PostgREST) перечитывает список таблиц и функций
notify pgrst, 'reload schema';
