-- CABINA, сервер, шаг 7 (2.22): группы коллег (решения Никиты 31.10 и 05.11.2026).
--
-- Группа — список людей с названием (бригада, колонна, депо). Создать может любой, кто включил «Коллеги»;
-- создатель — администратор: переименовать, пригласить, исключить, передать права, удалить группу.
-- Вступить можно только по приглашению: администратор приглашает своего коллегу или даёт код (QR-код) группы;
-- код можно сменить, старый сразу перестаёт работать. Переписки и описания у группы нет.
-- Не больше 10 групп у человека и 200 участников в группе, название — до 30 знаков (названия не уникальны).
--
-- Что добавляется на сервер:
--   public.groups         — название и дата создания;
--   public.group_members  — кто в группе, кто администратор, когда вступил и показывает ли он этой группе
--                           свой статус (show_status) и где он (show_place); по умолчанию — нет;
--   public.group_invites  — приглашения коллег в группу (кого, кто пригласил, когда); без ответа стираются через 30 дней;
--   private.group_codes   — текущий код группы (виден только администратору через group_code);
--   private.group_bans    — кого исключили: 30 дней не может вернуться по коду (по приглашению — может);
--   private.limits        — плюс счётчики за день: созданные группы, попытки ввести код, приглашения в группы.
--
-- Кто что видит (RLS):
--   группу и список участников — только участники (приглашённый — только название группы);
--   приглашения — приглашённый и администратор группы;
--   карточку (имя, должность и то, что человек разрешил в «Приватности») — ещё и участники общей группы;
--   статус — участники группы видят ТОЛЬКО если человек сам включил «Показывать моей группе» в этой группе
--   (решение Никиты 05.11.2026): само членство в группе статус не открывает. «Где я» — только вместе со статусом.
-- Новых сведений о поездках сервер не получает: статус тот же, что и для коллег (шаг 2–3), меняется только кому он виден.
-- Новая редакция согласия privacy-4: в ней появились группы. Кто принимал privacy-3, приложение попросит принять новую.
--
-- Применять одновременно с выпуском приложения 2.22: регистрация в старом приложении (редакция privacy-3) после
-- применения не пройдёт, а 2.22 без этой миграции пишет «группы на сервере ещё не включены» и работает как 2.21.

update private.config set value = 'privacy-4' where key = 'consent_version';
insert into private.config (key, value) values
  ('groups_max', '10'),           -- в скольких группах может быть человек (вместе со своими)
  ('group_members_max', '200'),   -- участников в группе (вместе с теми, кого пригласили и кто ещё не ответил)
  ('groups_per_day', '5'),        -- создать групп в день
  ('group_tries_per_day', '20'),  -- попыток ввести код группы в день (чтобы код нельзя было подобрать)
  ('group_invites_per_day', '50'); -- приглашений коллег в группы в день

alter table private.limits add column groups integer not null default 0;
alter table private.limits add column group_tries integer not null default 0;
alter table private.limits add column group_invites integer not null default 0;

-- ---------------------------------------------------------------- таблицы

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  show_status boolean not null default false,
  show_place boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  check (show_status or not show_place)          -- «где я» — только вместе со статусом
);
create index group_members_user on public.group_members (user_id);
create unique index group_members_one_admin on public.group_members (group_id) where role = 'admin';

create table public.group_invites (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,      -- кого пригласили
  invited_by uuid not null references auth.users (id) on delete cascade,   -- администратор, который пригласил
  created_at timestamptz not null default now(),
  primary key (group_id, user_id),
  check (user_id <> invited_by)
);
create index group_invites_user on public.group_invites (user_id);

-- Код хранится как есть (не отпечатком): администратор должен иметь возможность показать его снова.
-- Код даёт только право вступить; исключить и сменить код администратор может в любой момент.
create table private.group_codes (
  group_id uuid primary key references public.groups (id) on delete cascade,
  code text not null unique check (code ~ '^[0-9A-Z]{10}$'),
  created_at timestamptz not null default now()
);

create table private.group_bans (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table private.group_codes enable row level security;
alter table private.group_bans enable row level security;

-- ---------------------------------------------------------------- проверки для правил доступа
-- Работают от имени владельца базы, иначе правило для group_members ссылалось бы само на себя.

create function private.in_group(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.group_members where group_id = g and user_id = auth.uid())
$$;

create function private.invited_to(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.group_invites where group_id = g and user_id = auth.uid())
$$;

create function private.group_admin(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select u is not null and exists (select 1 from public.group_members where group_id = g and user_id = u and role = 'admin')
$$;

-- Есть ли у вошедшего общая группа с этим человеком
create function private.group_mate(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and other <> auth.uid() and exists (
    select 1 from public.group_members a join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = other)
$$;

create policy "мои группы и приглашения" on public.groups for select to authenticated
  using (private.in_group(id) or private.invited_to(id));
create policy "участники моих групп" on public.group_members for select to authenticated
  using (private.in_group(group_id));
create policy "приглашения мне и от меня" on public.group_invites for select to authenticated
  using (user_id = auth.uid() or private.group_admin(group_id, auth.uid()));

drop policy "своя карточка и тех, с кем есть предложение или связь" on public.cards;
create policy "карточки: своя, коллег, групп" on public.cards for select to authenticated
  using (user_id = auth.uid() or private.group_mate(cards.user_id) or exists (
    select 1 from public.links l
    where l.state in ('pending', 'accepted')
      and ((l.from_id = auth.uid() and l.to_id = cards.user_id) or (l.to_id = auth.uid() and l.from_id = cards.user_id))));

revoke all on public.groups, public.group_members, public.group_invites from anon, authenticated;
revoke all on private.group_codes, private.group_bans from anon, authenticated;
grant select on public.groups, public.group_members, public.group_invites to authenticated;

-- Показывает ли owner вошедшему это ('status' или 'place'): как раньше — коллеге по правилу «кому видно» (шаг 3),
-- и теперь — участнику общей группы, если owner в этой группе сам включил «Показывать моей группе».
create or replace function private.allowed(owner uuid, what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and owner <> auth.uid() and (
    (exists (select 1 from public.links l where l.state = 'accepted'
             and least(l.from_id, l.to_id) = least(owner, auth.uid()) and greatest(l.from_id, l.to_id) = greatest(owner, auth.uid()))
     and exists (select 1 from public.access a where a.user_id = owner and a.item = what
                 and (a.viewer_id is null or a.viewer_id = auth.uid())))
    or exists (select 1 from public.group_members o join public.group_members v on v.group_id = o.group_id and v.user_id = auth.uid()
               where o.user_id = owner and o.show_status and (what = 'status' or o.show_place)))
$$;

-- ---------------------------------------------------------------- служебное

-- Показывает ли человек кому-нибудь свой статус ('status') или где он ('place'). Если некому — сервер его не хранит.
create function private.shares(u uuid, what text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exists (select 1 from public.links l where l.state = 'accepted' and u in (l.from_id, l.to_id))
          and exists (select 1 from public.access a where a.user_id = u and a.item = what))
    or exists (select 1 from public.group_members m
               where m.user_id = u and (case when what = 'place' then m.show_place else m.show_status end)
                 and exists (select 1 from public.group_members x where x.group_id = m.group_id and x.user_id <> u))
$$;

-- Счётчик за день: как раньше, плюс группы
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
  else
    update private.limits set offers = offers + 1 where user_id = u and day = private.today() returning offers into n;
    if n > private.conf('offers_per_day')::int then raise exception 'cabina: limit' using errcode = 'P0001'; end if;
  end if;
end $$;

-- Лишнее не храним: как раньше, и ещё — карточка нужна участнику группы, статус хранится, только если его кому-то показывают
create or replace function private.tidy(u uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.cards c where c.user_id = u and not c.searchable
    and not exists (select 1 from public.links l where l.state <> 'declined' and u in (l.from_id, l.to_id))
    and not exists (select 1 from public.group_members m where m.user_id = u)
    and not exists (select 1 from public.group_invites i where u in (i.user_id, i.invited_by));
  delete from public.statuses s where s.user_id = u and not private.shares(u, 'status');
  delete from public.status_places p where p.user_id = u and not private.shares(u, 'place');
$$;

-- Нужна карточка: без имени участники не поймут, кто это
create function private.need_card(u uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.cards where user_id = u) then raise exception 'cabina: name required' using errcode = 'P0001'; end if;
end $$;

-- Можно ли человеку ещё в одну группу, а группе — ещё одного человека
create function private.room(u uuid, g uuid, invites_count boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  k integer;
begin
  if u is not null and (select count(*) from public.group_members where user_id = u) >= private.conf('groups_max')::int then
    raise exception 'cabina: groups limit' using errcode = 'P0001';
  end if;
  if g is null then return; end if;
  k := (select count(*) from public.group_members where group_id = g);
  if invites_count then k := k + (select count(*) from public.group_invites where group_id = g); end if;
  if k >= private.conf('group_members_max')::int then
    raise exception 'cabina: group full' using errcode = 'P0001';
  end if;
end $$;

create function private.new_group_code() returns text
language sql volatile security definer set search_path = '' as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
$$;

-- Ушёл администратор (вышел, удалил аккаунт) — администратором становится тот, кто дольше всех в группе.
-- Никого не осталось — группа удаляется вместе с кодом. Ушёл человек — его карточка и статус больше могут быть не нужны.
create function private.on_member_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.groups where id = old.group_id) then return null; end if;
  if not exists (select 1 from public.group_members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
    return null;
  end if;
  if old.role = 'admin' and not exists (select 1 from public.group_members where group_id = old.group_id and role = 'admin') then
    update public.group_members set role = 'admin'
      where group_id = old.group_id
        and user_id = (select user_id from public.group_members where group_id = old.group_id order by joined_at, user_id limit 1);
    -- приглашения от ушедшего администратора остаются действовать от группы: пригласил уже не он, а группа
  end if;
  perform private.tidy(old.user_id);
  return null;
end $$;
create trigger group_members_gone after delete on public.group_members
  for each row execute function private.on_member_gone();

-- Связь «коллеги» пропала — как раньше, стираются разрешения между этими двумя, и ещё приглашения в группы между ними
create or replace function private.forget_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.state <> 'accepted' then
    delete from public.access a
      where (a.user_id = old.from_id and a.viewer_id = old.to_id) or (a.user_id = old.to_id and a.viewer_id = old.from_id);
    delete from public.group_invites i
      where (i.invited_by = old.from_id and i.user_id = old.to_id) or (i.invited_by = old.to_id and i.user_id = old.from_id);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- для приложения (rpc)

-- Создать группу: я — администратор. Нужны согласие и карточка (имя).
create function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  n text := private.clean(p_name, 30);
  g uuid;
begin
  if n is null then raise exception 'cabina: name required' using errcode = 'P0001'; end if;
  perform private.need_card(u);
  perform private.room(u, null, false);
  perform private.spend(u, 'group');
  insert into public.groups (name) values (n) returning id into g;
  insert into public.group_members (group_id, user_id, role) values (g, u, 'admin');
  return g;
end $$;

create function public.rename_group(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  n text := private.clean(p_name, 30);
begin
  if not private.group_admin(p_group, u) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  if n is null then raise exception 'cabina: name required' using errcode = 'P0001'; end if;
  update public.groups set name = n where id = p_group;
end $$;

-- Удалить группу: стираются участники, приглашения, код. Согласие не нужно: убрать своё можно всегда.
create function public.delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  others uuid[];
  o uuid;
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if not private.group_admin(p_group, auth.uid()) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  select coalesce(array_agg(user_id), '{}') into others from public.group_members where group_id = p_group;
  delete from public.groups where id = p_group;
  foreach o in array others loop perform private.tidy(o); end loop;
end $$;

-- Код группы для администратора; p_new — сменить (старый сразу перестаёт работать)
create function public.group_code(p_group uuid, p_new boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  c text;
begin
  if not private.group_admin(p_group, u) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  select code into c from private.group_codes where group_id = p_group;
  if c is null or coalesce(p_new, false) then
    loop
      c := private.new_group_code();
      exit when not exists (select 1 from private.group_codes where code = c);
    end loop;
    insert into private.group_codes (group_id, code) values (p_group, c)
      on conflict (group_id) do update set code = excluded.code, created_at = now();
  end if;
  return c;
end $$;

-- Какая группа у этого кода: название и сколько участников — чтобы человек решил, вступать ли. Нет такого кода — null.
create function public.peek_group(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  g uuid;
begin
  perform private.spend(u, 'group_try');
  select group_id into g from private.group_codes where code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  -- не нашли — пустой ответ, а не ошибка: при ошибке откатилась бы и сама попытка, и код можно было бы подбирать
  if g is null then return null; end if;
  return (select jsonb_build_object('id', x.id, 'name', x.name, 'members', (select count(*) from public.group_members m where m.group_id = x.id),
                                    'member', exists (select 1 from public.group_members m where m.group_id = x.id and m.user_id = u))
          from public.groups x where x.id = g);
end $$;

-- Вступить по коду; нет такого кода — null. Исключённого администратором 30 дней по коду не пускаем (по приглашению — можно).
create function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  g uuid;
begin
  select group_id into g from private.group_codes where code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  -- не нашли — пустой ответ (попытка засчитана); с ошибкой она бы откатилась
  if g is null then perform private.spend(u, 'group_try'); return null; end if;
  if exists (select 1 from public.group_members where group_id = g and user_id = u) then return g; end if;
  if exists (select 1 from private.group_bans where group_id = g and user_id = u
             and at > now() - make_interval(days => private.conf('decline_days')::int)) then
    raise exception 'cabina: banned' using errcode = 'P0001';
  end if;
  perform private.need_card(u);
  perform private.room(u, g, false);
  insert into public.group_members (group_id, user_id) values (g, u);
  delete from public.group_invites where group_id = g and user_id = u;
  return g;
end $$;

-- Пригласить своего коллегу (администратор). Коллега увидит приглашение и сам решит.
create function public.invite_to_group(p_group uuid, p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
begin
  if not private.group_admin(p_group, u) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  if p_user is null or p_user = u or not exists (select 1 from public.links l where l.state = 'accepted' and l.id = private.pair(u, p_user)) then
    raise exception 'cabina: not found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = p_user) then return 'member'; end if;
  if exists (select 1 from public.group_invites where group_id = p_group and user_id = p_user) then return 'sent'; end if;
  perform private.room(null, p_group, true);
  perform private.spend(u, 'group_invite');
  insert into public.group_invites (group_id, user_id, invited_by) values (p_group, p_user, u);
  delete from private.group_bans where group_id = p_group and user_id = p_user;
  return 'sent';
end $$;

-- Отменить приглашение (администратор)
create function public.cancel_group_invite(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if not private.group_admin(p_group, auth.uid()) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  delete from public.group_invites where group_id = p_group and user_id = p_user;
end $$;

-- Ответ на приглашение в группу. Отказаться можно всегда, согласиться — с согласием и карточкой.
create function public.answer_group_invite(p_group uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.group_invites where group_id = p_group and user_id = u) then
    raise exception 'cabina: not found' using errcode = 'P0001';
  end if;
  if coalesce(p_accept, false) then
    perform private.me();
    perform private.need_card(u);
    perform private.room(u, p_group, false);
    insert into public.group_members (group_id, user_id) values (p_group, u) on conflict do nothing;
    delete from private.group_bans where group_id = p_group and user_id = u;
  end if;
  delete from public.group_invites where group_id = p_group and user_id = u;
  perform private.tidy(u);
end $$;

-- Выйти из группы. Администратор уходит — права переходят к тому, кто дольше всех в группе.
create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
end $$;

-- Исключить участника (администратор). По коду он 30 дней вернуться не сможет.
create function public.remove_from_group(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if not private.group_admin(p_group, auth.uid()) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'cabina: not found' using errcode = 'P0001'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
  if found then
    insert into private.group_bans (group_id, user_id) values (p_group, p_user)
      on conflict (group_id, user_id) do update set at = now();
  end if;
end $$;

-- Передать права администратора другому участнику: администратор в группе всегда один
create function public.make_group_admin(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
begin
  if not private.group_admin(p_group, u) then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  if p_user is null or p_user = u or not exists (select 1 from public.group_members where group_id = p_group and user_id = p_user) then
    raise exception 'cabina: not found' using errcode = 'P0001';
  end if;
  update public.group_members set role = 'member' where group_id = p_group and user_id = u;
  update public.group_members set role = 'admin' where group_id = p_group and user_id = p_user;
end $$;

-- Показывать ли этой группе мой статус и где я. Включить — с согласием, выключить — всегда.
-- Никому не показываю — статус (станции) на сервере не хранится.
create function public.set_group_share(p_group uuid, p_status boolean, p_place boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  st boolean := coalesce(p_status, false);
  pl boolean := coalesce(p_status, false) and coalesce(p_place, false);
begin
  if u is null then raise exception 'cabina: not signed in' using errcode = '42501'; end if;
  if st then perform private.me(); end if;
  update public.group_members set show_status = st, show_place = pl where group_id = p_group and user_id = u;
  if not found then raise exception 'cabina: not found' using errcode = 'P0001'; end if;
  perform private.tidy(u);
end $$;

-- Кому показывать статус коллегам (шаг 3): как раньше, только статус стирается, лишь если его не видит и ни одна группа
create or replace function public.set_access(p_item text, p_all boolean, p_ids uuid[]) returns void
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
  if not private.shares(u, 'status') then delete from public.statuses where user_id = u; end if;
  if not private.shares(u, 'place') then delete from public.status_places where user_id = u; end if;
end $$;

-- Текущий статус: как раньше (шаг 3), только «показывать некому» теперь учитывает и группы
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
  if not private.shares(u, 'status') then
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
  if (pl is null and ds is null) or not private.shares(u, 'place') then
    delete from public.status_places where user_id = u;
  else
    insert into public.status_places (user_id, place, dest) values (u, pl, ds)
    on conflict (user_id) do update set place = excluded.place, dest = excluded.dest;
  end if;
end $$;

-- Выйти из «Коллег»: как раньше, и ещё — из всех групп (свои группы переходят к другим участникам) и приглашения в группы
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
  delete from public.links where u in (from_id, to_id) and (state <> 'declined' or to_id = u);
  delete from public.access where user_id = u;
  delete from public.cards where user_id = u;
  perform private.withdraw_publish(u);
  foreach o in array others loop perform private.tidy(o); end loop;
end $$;

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14): плюс группы
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
                 'reply_by_email', d.reply_ok)
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
      from public.group_invites i join public.groups g on g.id = i.group_id where u.id in (i.user_id, i.invited_by)), '[]'::jsonb)
  )
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;

-- ---------------------------------------------------------------- ежедневная очистка

-- Как раньше, плюс: статусы, которые никому не показывают (в том числе группам), приглашения в группы без ответа
-- старше 30 дней, отметки об исключении старше паузы
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
  delete from private.limits where day < private.today() - 1;

  delete from private.invites where used_at is null and expires_at < now();
  delete from public.ideas where answered_at < now() - make_interval(days => private.conf('idea_keep_days')::int);
end $$;

-- ---------------------------------------------------------------- права на функции

-- Новые служебные функции закрыты от приложения; проверки для правил RLS — доступны (вызываются от имени вошедшего)
revoke all on function private.in_group(uuid), private.invited_to(uuid), private.group_admin(uuid, uuid), private.group_mate(uuid),
  private.shares(uuid, text), private.need_card(uuid), private.room(uuid, uuid, boolean), private.new_group_code(),
  private.on_member_gone() from public, anon, authenticated;
grant execute on function private.in_group(uuid), private.invited_to(uuid), private.group_admin(uuid, uuid), private.group_mate(uuid)
  to authenticated;

revoke all on function public.create_group(text), public.rename_group(uuid, text), public.delete_group(uuid),
  public.group_code(uuid, boolean), public.peek_group(text), public.join_group(text), public.invite_to_group(uuid, uuid),
  public.cancel_group_invite(uuid, uuid), public.answer_group_invite(uuid, boolean), public.leave_group(uuid),
  public.remove_from_group(uuid, uuid), public.make_group_admin(uuid, uuid), public.set_group_share(uuid, boolean, boolean)
  from public, anon;
grant execute on function public.create_group(text), public.rename_group(uuid, text), public.delete_group(uuid),
  public.group_code(uuid, boolean), public.peek_group(text), public.join_group(text), public.invite_to_group(uuid, uuid),
  public.cancel_group_invite(uuid, uuid), public.answer_group_invite(uuid, boolean), public.leave_group(uuid),
  public.remove_from_group(uuid, uuid), public.make_group_admin(uuid, uuid), public.set_group_share(uuid, boolean, boolean)
  to authenticated;
-- allowed, spend, tidy, forget_access, set_access, set_status, leave_colleagues, export_my_data, cleanup_logs пересозданы
-- через create or replace — права остались прежними

-- Сервер API (PostgREST) перечитывает список таблиц и функций
notify pgrst, 'reload schema';
