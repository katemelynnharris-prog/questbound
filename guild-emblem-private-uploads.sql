-- Private guild artwork: members can view; guild admins can replace the PNG.
create table public.guild_emblems (
 guild_id uuid primary key references public.guilds(id) on delete cascade,
 object_path text not null,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 constraint guild_emblem_path check(object_path ~ ('^'||guild_id::text||'/[0-9a-f-]{36}\.png$'))
);
alter table public.guild_emblems enable row level security;
revoke all on public.guild_emblems from public,anon,authenticated;
grant select,insert,update on public.guild_emblems to authenticated;
create policy guild_emblem_members_read on public.guild_emblems for select to authenticated using(public.is_guild_member(guild_id));
create policy guild_emblem_admin_insert on public.guild_emblems for insert to authenticated with check(
 updated_by=(select auth.uid()) and exists(select 1 from public.guild_members m where m.guild_id=guild_emblems.guild_id and m.user_id=(select auth.uid()) and m.role='admin')
);
create policy guild_emblem_admin_update on public.guild_emblems for update to authenticated using(
 exists(select 1 from public.guild_members m where m.guild_id=guild_emblems.guild_id and m.user_id=(select auth.uid()) and m.role='admin')
) with check(
 updated_by=(select auth.uid()) and exists(select 1 from public.guild_members m where m.guild_id=guild_emblems.guild_id and m.user_id=(select auth.uid()) and m.role='admin')
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('guild-emblems','guild-emblems',false,8388608,array['image/png'])
 on conflict(id) do nothing;
create policy guild_emblem_files_read on storage.objects for select to authenticated using(
 bucket_id='guild-emblems' and exists(select 1 from public.guild_members m where m.guild_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()))
);
create policy guild_emblem_files_insert on storage.objects for insert to authenticated with check(
 bucket_id='guild-emblems' and exists(select 1 from public.guild_members m where m.guild_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.role='admin')
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.png$'
);
create policy guild_emblem_files_delete on storage.objects for delete to authenticated using(
 bucket_id='guild-emblems' and exists(select 1 from public.guild_members m where m.guild_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.role='admin')
);
