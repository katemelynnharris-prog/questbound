-- Optional adventure challenges and dated co-op local events.
create table public.local_event_claims(
 guild_id uuid not null references public.guilds(id), event_key text not null,
 expedition_id uuid not null references public.expeditions(id), claimed_at timestamptz not null default now(),
 primary key(guild_id,event_key)
);
create table public.local_event_refresh(id int primary key check(id=1), attempted_at timestamptz, checked_at timestamptz, status text, source_results jsonb);
insert into public.local_event_refresh(id,status) values(1,'curated');
alter table public.local_event_claims enable row level security;
alter table public.local_event_refresh enable row level security;
revoke all on public.local_event_claims,public.local_event_refresh from public,anon,authenticated;
grant select on public.local_event_claims,public.local_event_refresh to authenticated;
grant all on public.local_event_refresh,public.local_map_destinations to service_role;
create policy event_claims_members on public.local_event_claims for select to authenticated using(public.is_guild_member(guild_id));
create policy event_refresh_members on public.local_event_refresh for select to authenticated using(exists(select 1 from public.guild_members where user_id=(select auth.uid())));
-- Atomic server-side refresh lease. Only the trusted collector may acquire it.
create function game_private.local_event_refresh_lease() returns boolean language plpgsql set search_path='' as $$
begin
 update public.local_event_refresh set attempted_at=now(),status='checking' where id=1
 and (attempted_at is null or attempted_at<now()-case when status='ok' then interval '6 days' else interval '6 hours' end);
 return found;
end $$;
-- Expose service-only wrapper because private schemas are not in the Data API.
create function public.local_event_refresh_lease() returns boolean language sql security definer set search_path='' as $$select game_private.local_event_refresh_lease()$$;
revoke all on function game_private.local_event_refresh_lease(),public.local_event_refresh_lease() from public,anon,authenticated;
grant execute on function public.local_event_refresh_lease() to service_role;
create or replace function game_private.local_map_pick_bonus(p_guild uuid,p_dest text,p_free boolean,p_equipment text[],p_exclude text default null)
returns text language sql volatile set search_path='' as $$
 select b.key from public.local_map_bonuses b join public.local_map_destinations d on d.key=p_dest
 where coalesce((b.data->>'active')::boolean,true)
 and b.key is distinct from p_exclude
 and exists(select 1 from jsonb_array_elements_text(b.data->'tags') t where d.data->'tags' ? t)
 and (not p_free or not (b.data->>'requires_purchase')::boolean)
 and (b.key<>'free-adventure' or not (d.data->>'requires_purchase')::boolean)
 and (b.key<>'hammock' or (coalesce((d.data->>'hammock_tree_permission')::boolean,false) and d.data->>'hammock_permission_url' like 'https://%'))
 order by (b.key in(select r.bonus_key from public.local_map_runs r where r.guild_id=p_guild order by r.created_at desc limit 3)),random() limit 1;
$$;
create or replace function public.local_map_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare gid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 return jsonb_build_object(
  'destinations',(select coalesce(jsonb_agg(data order by data->>'name'),'[]') from public.local_map_destinations d where not (data ? 'event_key') or ((data->>'event_ends_at')::timestamptz>now() and not coalesce((data->>'cancelled')::boolean,false)) or exists(select 1 from public.local_map_runs r where r.guild_id=gid and r.destination_key=d.key)),
  'bonuses',(select coalesce(jsonb_agg(data),'[]') from public.local_map_bonuses),
  'runs',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('visited_at',coalesce(r.visited_at,case when e.status='complete' then e.completed_at end)) order by r.created_at desc),'[]') from public.local_map_runs r join public.expeditions e on e.id=r.expedition_id where r.guild_id=gid),
  'events',(select coalesce(jsonb_agg(d.data order by d.data->>'event_starts_at'),'[]') from public.local_map_destinations d where d.data ? 'event_key' and (d.data->>'event_ends_at')::timestamptz>now()-interval '72 hours' and (d.data->>'event_starts_at')::timestamptz<now()+interval '45 days' and not coalesce((d.data->>'cancelled')::boolean,false)),
  'event_claims',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.local_event_claims c where c.guild_id=gid),
  'event_refresh',(select to_jsonb(f) from public.local_event_refresh f where id=1),
  'home',jsonb_build_object('lat',36.0687,'lng',-86.7241,'label','Home region · 37211'));
end $$;

create or replace function public.local_expedition_action(p_action text,p_expedition_id uuid default null,p_free boolean default false,p_setting text default 'any',p_equipment text[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();gid uuid;e public.expeditions;r public.local_map_runs;d public.local_map_destinations;b text;result jsonb;xp int;cid uuid;total_renown int;
begin
 if uid is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=uid limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 if p_setting not in ('any','indoor','outdoor') or p_setting is null or p_free is null then raise exception 'Invalid outing filters';end if;
 if p_equipment is null or not p_equipment <@ array['polaroid','hammock']::text[] then raise exception 'Invalid equipment';end if;
 -- Serialize draws and claims for this guild; no duplicate active local draws.
 perform 1 from public.guilds where id=gid for update;
 if p_action in ('skip','complete','bonus','reroll_bonus') then
  select * into e from public.expeditions where id=p_expedition_id and guild_id=gid for update;
  if not found then raise exception 'Expedition unavailable';end if;
  select * into r from public.local_map_runs where expedition_id=e.id and guild_id=gid for update;
  if not found then raise exception 'Choose a local destination first';end if;
  if p_action='complete' then
   select * into d from public.local_map_destinations where key=r.destination_key;
   if d.data ? 'event_key' then
    if exists(select 1 from public.local_event_claims c where c.guild_id=gid and c.event_key=d.data->>'event_key' and c.expedition_id<>e.id) then return jsonb_build_object('already_complete',true);end if;
    if r.visited_at is null and e.status<>'complete' then
     if now()<(d.data->>'event_starts_at')::timestamptz or now()>(d.data->>'event_ends_at')::timestamptz+interval '72 hours' then raise exception 'This event is not available for attendance claims';end if;
     if coalesce((d.data->>'cancelled')::boolean,false) then raise exception 'This event was cancelled';end if;
    end if;
    insert into public.local_event_claims(guild_id,event_key,expedition_id) values(gid,d.data->>'event_key',e.id) on conflict do nothing;
   end if;
   if r.visited_at is not null then return jsonb_build_object('already_complete',true);end if;
   if e.status='complete' and e.completed_at is not null then
    perform game_private.local_map_coop_xp(e,coalesce((e.metadata->>'completed_by')::uuid,e.drawn_by,uid),false);
    update public.local_map_runs set visited_at=e.completed_at,visited_by=e.drawn_by where expedition_id=e.id;
    return jsonb_build_object('already_complete',true,'visited',true);
   end if;
   if e.status<>'active' then raise exception 'Expedition unavailable';end if;
   result:=public.complete_expedition_abilities(e.id);
   result:=result||jsonb_build_object('co_op',true,'partner_rewards',game_private.local_map_coop_xp(e,uid,false));
   update public.local_map_runs set visited_at=now(),visited_by=uid where expedition_id=e.id;
   if result->>'extra_revealed_cell' is not null then
    select x.* into d from public.local_map_destinations x
    join public.local_map_destinations origin on origin.key=r.destination_key
    where x.key<>r.destination_key and not exists(select 1 from public.local_map_runs h where h.guild_id=gid and (h.destination_key=x.key and h.visited_at is not null or h.scouted_destination_key=x.key))
    order by power((x.data->>'lat')::numeric-(origin.data->>'lat')::numeric,2)+power((x.data->>'lng')::numeric-(origin.data->>'lng')::numeric,2) limit 1;
    if found then update public.local_map_runs set scouted_destination_key=d.key where expedition_id=e.id;end if;
   end if;
   return result||jsonb_build_object('destination_key',r.destination_key,'visited',true);
  elsif p_action='bonus' then
   if coalesce(r.visited_at,e.completed_at) is null or e.status<>'complete' then raise exception 'Complete the visit before claiming its bonus';end if;
   if r.bonus_key is null then raise exception 'No bonus assigned';end if;
   if r.bonus_completed_at is not null then return jsonb_build_object('already_complete',true);end if;
   if r.visited_at is null then
    perform game_private.local_map_coop_xp(e,coalesce((e.metadata->>'completed_by')::uuid,e.drawn_by,uid),false);
   end if;
   update public.local_map_runs set bonus_completed_at=now(),bonus_completed_by=uid,visited_at=coalesce(visited_at,e.completed_at),visited_by=coalesce(visited_by,e.drawn_by) where expedition_id=e.id;
   update public.player_progress_public set personal_xp=personal_xp+50,updated_at=now() where guild_id=gid and user_id=uid returning personal_xp into xp;
   update public.player_progress_public set level=public.qb_level_for_xp(xp),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(xp)) where guild_id=gid and user_id=uid;
   perform game_private.local_map_coop_xp(e,uid,true);
   select id into cid from public.campaigns where guild_id=gid and status='active' order by started_at desc limit 1 for update;
   if cid is not null then
    update public.campaigns set campaign_xp=least(goal_xp,campaign_xp+10),status=case when campaign_xp+10>=goal_xp then 'victory' else status end,completed_at=case when campaign_xp+10>=goal_xp then coalesce(completed_at,now()) else completed_at end where id=cid;
    insert into public.campaign_contributions(campaign_id,user_id,campaign_xp) values(cid,uid,10) on conflict(campaign_id,user_id) do update set campaign_xp=public.campaign_contributions.campaign_xp+excluded.campaign_xp;
   end if;
   update public.exploration_state set renown=renown+1,updated_at=now() where guild_id=gid returning renown into total_renown;
   update public.exploration_state set exploration_rank=case when total_renown<5 then 'Home Territory' when total_renown<12 then 'Beyond the Keep' when total_renown<25 then 'Greater Wilds' else 'Open Road' end where guild_id=gid;
   insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,campaign_xp,metadata)
   values(gid,uid,uid,'expedition_bonus','Adventure bonus: '||(select data->>'title' from public.local_map_bonuses where key=r.bonus_key),'guild',50,case when cid is null then 0 else 10 end,jsonb_build_object('expedition_id',e.id,'destination_key',r.destination_key,'renown',1));
   return jsonb_build_object('personal_xp',50,'campaign_xp',case when cid is null then 0 else 10 end,'renown',1,'co_op',true);
  elsif p_action='reroll_bonus' then
   if e.status not in ('active','complete') or r.bonus_completed_at is not null then raise exception 'Bonus reroll unavailable';end if;
   b:=game_private.local_map_pick_bonus(gid,r.destination_key,r.free_only,r.equipment,r.bonus_key);
   if b is null then raise exception 'No alternative challenge fits this outing';end if;
   update public.local_map_runs set bonus_key=b,bonus_rerolled=true where expedition_id=e.id;
   return jsonb_build_object('bonus_key',b);
  else
   if e.status<>'active' then raise exception 'Expedition unavailable';end if;
   update public.expeditions set status='discarded' where id=e.id;
   -- Continue into draw with the newly selected filters.
  end if;
 elsif p_action<>'draw' or p_action is null then raise exception 'Unknown expedition action';
 end if;
 select * into e from public.expeditions where guild_id=gid and status='active' order by drawn_at desc limit 1 for update;
 if found and exists(select 1 from public.local_map_runs where expedition_id=e.id) then return to_jsonb(e);end if;
 select x.* into d from public.local_map_destinations x
 where (not p_free or not (x.data->>'requires_purchase')::boolean)
 and (not (x.data ? 'event_key') or (
  now()>=(x.data->>'event_starts_at')::timestamptz and now()<=(x.data->>'event_ends_at')::timestamptz
  and not coalesce((x.data->>'cancelled')::boolean,false)
  and not exists(select 1 from public.local_event_claims c where c.guild_id=gid and c.event_key=x.data->>'event_key')))

 and (p_setting='any' or (p_setting='indoor' and x.data->'tags' ? 'indoor') or (p_setting='outdoor' and (x.data->'tags' ? 'outdoor' or x.data->'tags' ? 'urban')))
 and (p_action<>'skip' or x.key<>r.destination_key)
 order by exists(select 1 from public.local_map_runs h where h.guild_id=gid and h.destination_key=x.key and h.visited_at is not null),
 (x.key in(select h.destination_key from public.local_map_runs h where h.guild_id=gid order by h.created_at desc limit 3)),random() limit 1;
 if not found then raise exception 'No destinations fit these filters';end if;
 b:=game_private.local_map_pick_bonus(gid,d.key,p_free,p_equipment);
 if e.id is null then
  insert into public.expeditions(guild_id,drawn_by,title,objective,status,renown_reward,xp_personal,xp_campaign,metadata)
  values(gid,uid,'Explore '||(d.data->>'name'),'Visit '||(d.data->>'name')||' and explore something unfamiliar.','active',4,100,25,jsonb_build_object('pool','local_map_v1')) returning * into e;
 else
  -- Attach a destination to an existing generic expedition without changing rewards.
  update public.expeditions set title='Explore '||(d.data->>'name'),objective='Visit '||(d.data->>'name')||' and explore something unfamiliar.',metadata=metadata||jsonb_build_object('pool','local_map_v1') where id=e.id returning * into e;
 end if;
 insert into public.local_map_runs(expedition_id,guild_id,destination_key,bonus_key,free_only,equipment) values(e.id,gid,d.key,b,p_free,p_equipment);
 return to_jsonb(e);
end $$;

create function public.attend_local_event(p_event_key text,p_free boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();gid uuid;d public.local_map_destinations;e public.expeditions;b text;result jsonb;
begin
 if uid is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=uid limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 perform 1 from public.guilds where id=gid for update;
 if exists(select 1 from public.local_event_claims where guild_id=gid and event_key=p_event_key) then return jsonb_build_object('already_complete',true);end if;
 select * into d from public.local_map_destinations where data->>'event_key'=p_event_key;
 if not found then raise exception 'Event unavailable';end if;
 if p_free is null or (p_free and (d.data->>'requires_purchase')::boolean) then raise exception 'This event does not match free outing only';end if;
 if now()<(d.data->>'event_starts_at')::timestamptz or now()>(d.data->>'event_ends_at')::timestamptz+interval '72 hours' or coalesce((d.data->>'cancelled')::boolean,false) then raise exception 'Event unavailable for attendance claims';end if;
 select x.* into e from public.expeditions x join public.local_map_runs r on r.expedition_id=x.id where x.guild_id=gid and r.destination_key=d.key and x.status in ('active','complete') order by x.completed_at nulls last limit 1;
 if e.id is null then
  insert into public.expeditions(guild_id,drawn_by,title,objective,status,renown_reward,xp_personal,xp_campaign,metadata)
  values(gid,uid,'Attend '||(d.data->>'name'),'Attend this local event together.','active',4,100,25,jsonb_build_object('pool','local_events_v1','event_key',p_event_key)) returning * into e;
  b:=game_private.local_map_pick_bonus(gid,d.key,p_free,'{}');
  insert into public.local_map_runs(expedition_id,guild_id,destination_key,bonus_key,free_only) values(e.id,gid,d.key,b,p_free);
 end if;
 result:=public.local_expedition_action('complete',e.id);
 return result||jsonb_build_object('expedition_id',e.id);
end $$;
revoke all on function public.attend_local_event(text,boolean) from public,anon;
grant execute on function public.attend_local_event(text,boolean) to authenticated;
