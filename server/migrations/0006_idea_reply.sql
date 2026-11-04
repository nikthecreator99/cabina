-- CABINA, сервер, шаг 6 (2.21): «Можно ответить мне на почту» у идеи (просьба Никиты 04.11.2026).
--
-- Раньше администратор видел идею без почты автора. Теперь автор сам, отдельно у каждой идеи, может отметить
-- «Можно ответить мне на почту» (по умолчанию не отмечено). Только у таких идей администратор видит почту автора —
-- чтобы ответить ему письмом. Новых данных сервер не собирает: почта уже есть у аккаунта; меняется только то,
-- что видит администратор, и только по выбору человека. Стёр идею — пропала и отметка.
--
-- Применять ДО выпуска приложения 2.21 (старое приложение с новым сервером работает как раньше).

alter table public.ideas add column reply_ok boolean not null default false;

-- Идея: только текст, без служебных символов; не больше ideas_per_day в день; p_reply — «можно ответить на почту»
drop function public.send_idea(text);
create function public.send_idea(p_body text, p_reply boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.me();
  b text := private.clean(p_body, 500);
  i uuid;
begin
  if b is null or char_length(b) < 3 then raise exception 'cabina: empty' using errcode = 'P0001'; end if;
  perform private.spend(u, 'idea');
  insert into public.ideas (user_id, body, reply_ok) values (u, b, coalesce(p_reply, false)) returning id into i;
  return i;
end $$;
revoke all on function public.send_idea(text, boolean) from public, anon;
grant execute on function public.send_idea(text, boolean) to authenticated;

-- Идеи для администратора: почта автора — только у идей с отметкой «Можно ответить мне на почту», id автора — никогда
create or replace function public.admin_ideas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'cabina: forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'body', d.body, 'state', d.state,
      'created_at', d.created_at, 'answered_at', d.answered_at,
      'email', case when d.reply_ok then (select u.email from auth.users u where u.id = d.user_id) end)
      order by d.state = 'new' desc, d.created_at desc)
    from (select * from public.ideas order by created_at desc limit 300) d), '[]'::jsonb);
end $$;

-- Всё, что сервер знает о человеке (152-ФЗ, ст. 14): плюс отметка «можно ответить на почту» у идей
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
      from public.access a where a.user_id = u.id), '[]'::jsonb)
  )
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid()
$$;
