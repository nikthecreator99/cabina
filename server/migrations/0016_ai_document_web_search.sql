-- Поиск по открытым документам и лимит платных обращений к поиску Яндекса.
-- Бета доступна администратору. Открытие для подписчиков потребует проверки подписки.
begin;

create function public.ai_document_matches(p_query text)
returns table(title text, edition text, source text, ref text, body text)
language plpgsql stable security definer set search_path = '' as $$
declare
  words tsquery;
begin
  if not private.ai_allowed() or not private.is_admin() then
    raise exception 'cabina: forbidden' using errcode = '42501';
  end if;
  words := plainto_tsquery('russian', left(p_query, 500));
  return query
    select d.title, d.edition, d.source, c.ref, c.body
    from private.ai_chunks c join private.ai_docs d on d.id = c.doc_id
    where c.tsv @@ words
    order by ts_rank_cd(c.tsv, words) desc, c.id limit 3;
end $$;

create table private.ai_web_month (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  n integer not null default 0,
  primary key(user_id, month)
);
alter table private.ai_web_month enable row level security;
revoke all on private.ai_web_month from public, anon, authenticated;

insert into private.config (key, value) values
  ('ai_web_per_month', '20'), ('ai_web_global_per_day', '50')
on conflict do nothing;
alter table private.ai_daily add column web_calls integer not null default 0;

create function public.ai_web_reserve() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date := private.today();
  period date := date_trunc('month', today)::date;
  cap integer := private.conf('ai_web_per_month')::integer;
  used integer;
begin
  if not private.ai_allowed() or not private.is_admin() then
    raise exception 'cabina: forbidden' using errcode = '42501';
  end if;
  insert into private.ai_daily(day) values (today) on conflict do nothing;
  update private.ai_daily set web_calls = web_calls + 1
    where day = today and web_calls < private.conf('ai_web_global_per_day')::integer;
  if not found then raise exception 'cabina: ai busy'; end if;
  insert into private.ai_web_month(user_id, month) values(auth.uid(), period) on conflict do nothing;
  update private.ai_web_month set n = n + 1
    where user_id = auth.uid() and month = period and n < cap returning n into used;
  if not found then raise exception 'cabina: month limit'; end if;
  delete from private.ai_web_month where user_id = auth.uid() and month < period;
  return cap - used;
end $$;
revoke all on function public.ai_document_matches(text), public.ai_web_reserve() from public, anon;
grant execute on function public.ai_document_matches(text), public.ai_web_reserve() to authenticated;
notify pgrst, 'reload schema';
commit;
