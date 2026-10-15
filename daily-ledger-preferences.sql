-- Personal display choices only. Quest definitions and rewards remain authoritative.
create table public.daily_ledger_preferences (
 guild_id uuid not null,
 user_id uuid not null,
 quest_ids uuid[] not null default '{}',
 primary key (guild_id,user_id),
 foreign key (guild_id,user_id) references public.guild_members(guild_id,user_id) on delete cascade,
 check (cardinality(quest_ids)<=500)
);
alter table public.daily_ledger_preferences enable row level security;
revoke all on public.daily_ledger_preferences from public,anon,authenticated;
grant select,insert,update on public.daily_ledger_preferences to authenticated;
create policy daily_ledger_read_own on public.daily_ledger_preferences
 for select to authenticated
 using (user_id=(select auth.uid()) and public.is_guild_member(guild_id));
create policy daily_ledger_insert_own on public.daily_ledger_preferences
 for insert to authenticated
 with check (user_id=(select auth.uid()) and public.is_guild_member(guild_id));
create policy daily_ledger_update_own on public.daily_ledger_preferences
 for update to authenticated
 using (user_id=(select auth.uid()) and public.is_guild_member(guild_id))
 with check (user_id=(select auth.uid()) and public.is_guild_member(guild_id));
