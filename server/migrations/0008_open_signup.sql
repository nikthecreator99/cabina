-- CABINA, сервер, шаг 8 (2.26): приглашение засчитывается и при открытой регистрации.
--
-- До сих пор код приглашения проверялся только в закрытом режиме (invite_only = 'true'). Если регистрацию откроют
-- для всех (invite_only = 'false'), код из приглашения просто терялся бы — и пригласивший не получил бы вещи
-- для персонажа. Теперь живой код погашается всегда, когда человек его вписал; ошибка «нужно приглашение» —
-- по-прежнему только в закрытом режиме. Новых данных сервер не собирает: то же, что и при закрытой регистрации.
--
-- Сам режим эта миграция НЕ меняет. Открыть регистрацию для всех — отдельной командой (только по решению Никиты):
--   update private.config set value = 'false' where key = 'invite_only';
-- Применять можно в любой момент: приложение 2.25 и 2.26 работают с ним одинаково.

create or replace function private.on_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  p text := meta ->> 'platform';
  v text := meta ->> 'version';
  code text := coalesce(meta ->> 'invite', '');
  inv text;
begin
  if meta ->> 'consent' is distinct from private.conf('consent_version') then
    raise exception 'cabina: consent required' using errcode = 'P0001';
  end if;

  -- вписан код — погашаем живое приглашение (засчитается пригласившему); нет живого в закрытом режиме — отказ
  if code <> '' then
    update private.invites set used_at = now(), used_by = new.id
      where code_hash = private.hash_code(code)
        and used_at is null and expires_at > now()
      returning code_hash into inv;
  end if;
  if inv is null and private.conf('invite_only') = 'true' then
    raise exception 'cabina: invite required' using errcode = 'P0001';
  end if;

  if p not in ('web', 'android', 'ios') then p := null; end if;
  if v !~ '^\d{1,3}\.\d{1,3}\.\d{1,3}$' then v := null; end if;

  insert into public.profiles (id, last_seen, platform, app_version)
    values (new.id, private.today(), p, v);
  insert into public.consents (user_id, document) values (new.id, meta ->> 'consent');
  perform private.bump('signup', p);

  -- Код приглашения и прочее из регистрации в аккаунте не храним.
  update auth.users set raw_user_meta_data = '{}'::jsonb where id = new.id;
  return null;
end $$;
