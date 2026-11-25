create or replace function public.admin_delete_idea(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'cabina: forbidden' using errcode = '42501';
  end if;
  delete from public.ideas where id = p_id;
end $$;
revoke all on function public.admin_delete_idea(uuid) from public, anon;
grant execute on function public.admin_delete_idea(uuid) to authenticated;
notify pgrst, 'reload schema';
