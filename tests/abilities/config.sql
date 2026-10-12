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

create function public.ability_preferences_state()
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare gid uuid;lvl int;s jsonb;w date;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid();
 select choices into s from public.ability_preferences where guild_id=gid and user_id=auth.uid();
 w:=public.qb_effective_date(gid);w:=w-(extract(isodow from w)::int-1);
 return jsonb_build_object('choices',coalesce(s,'{}'),'level',coalesce(lvl,1),'focus_capacity',case when lvl>=60 then 6 else 5 end,
 'contract_used',exists(select 1 from public.contract_uses where guild_id=gid and user_id=auth.uid() and week_key=w),'resets',w+7);
end $f$;
revoke all on function public.ability_preferences_state() from public,anon;grant execute on function public.ability_preferences_state() to authenticated;

create function public.set_ability_preference(p_key text,p_value text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare gid uuid;lvl int;s jsonb;q public.quest_templates;pins jsonb;cap int;needed int;w date;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid();
 needed:=case p_key when 'contract' then 25 when 'favor' then 40 when 'masterwork' then 50 when 'pin' then 1 else null end;
 if needed is null or coalesce(lvl,1)<needed then raise exception 'Ability not unlocked';end if;
 if p_value is null then raise exception 'Choose a value';end if;
 insert into public.ability_preferences(guild_id,user_id) values(gid,auth.uid()) on conflict do nothing;
 select choices into s from public.ability_preferences where guild_id=gid and user_id=auth.uid() for update;
 if p_value='' then s:=s-p_key;
 elsif p_key in ('contract','pin') then
  select * into q from public.quest_templates where id=p_value::uuid and guild_id=gid and active and not hidden_encounter;
  if not found or not public.can_view_quest(q.id) then raise exception 'Quest unavailable';end if;
  if q.owner_type='individual' and not coalesce(q.assigned_user_id=auth.uid() or (q.assigned_user_id is null and lower(q.assignee_key)=(select lower(player_key) from public.guild_members where guild_id=gid and user_id=auth.uid())),false) then raise exception 'Quest assigned to another player';end if;
  if p_key='contract' then
   w:=public.qb_effective_date(gid);w:=w-(extract(isodow from w)::int-1);
   if exists(select 1 from public.contract_uses where guild_id=gid and user_id=auth.uid() and week_key=w) then raise exception 'Contract used this week';end if;
   if not (game_private.quest_cycle(q,auth.uid(),public.qb_effective_date(gid))->>'available')::boolean then raise exception 'Quest not available';end if;
   s:=jsonb_set(s,'{contract}',to_jsonb(p_value));
  else
   pins:=coalesce(s->'pin','[]');cap:=case when lvl>=60 then 6 else 5 end;
   if pins @> jsonb_build_array(p_value) then select coalesce(jsonb_agg(value),'[]') into pins from jsonb_array_elements_text(pins) where value<>p_value;
   else if jsonb_array_length(pins)>=cap then raise exception 'All focus slots are full';end if;pins:=pins||jsonb_build_array(p_value);end if;
   s:=jsonb_set(s,'{pin}',pins);
  end if;
 elsif p_key='favor' then
  if not exists(select 1 from public.quest_templates where guild_id=gid and active and category=p_value and public.can_view_quest(id)) then raise exception 'Choose an existing category';end if;
  s:=jsonb_set(s,'{favor}',to_jsonb(p_value));
 elsif p_key='masterwork' then
  if p_value not in ('second_wind','rested','contract','rally','favor') then raise exception 'Choose an earlier ability';end if;
  s:=jsonb_set(s,'{masterwork}',to_jsonb(p_value));
 end if;
 update public.ability_preferences set choices=s where guild_id=gid and user_id=auth.uid();
 return public.ability_preferences_state();
end $f$;
revoke all on function public.set_ability_preference(text,text) from public,anon;grant execute on function public.set_ability_preference(text,text) to authenticated;

