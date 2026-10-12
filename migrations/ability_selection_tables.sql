create table public.ability_preferences(
 guild_id uuid not null references public.guilds(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 choices jsonb not null default '{}',primary key(guild_id,user_id));
alter table public.ability_preferences enable row level security;
create policy ability_preferences_self on public.ability_preferences for select to authenticated using(user_id=(select auth.uid()) and public.is_guild_member(guild_id));
revoke all on public.ability_preferences from public,anon,authenticated;grant select on public.ability_preferences to authenticated;
create table public.contract_uses(
 guild_id uuid not null references public.guilds(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 week_key date not null,completion_id uuid not null references public.quest_completions(id) on delete cascade,bonus integer not null,
 primary key(guild_id,user_id,week_key));
alter table public.contract_uses enable row level security;
create policy contract_uses_self on public.contract_uses for select to authenticated using(user_id=(select auth.uid()) and public.is_guild_member(guild_id));
revoke all on public.contract_uses from public,anon,authenticated;grant select on public.contract_uses to authenticated;

