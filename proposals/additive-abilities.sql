-- DRAFT ONLY: NOT VALIDATED OR APPROVED FOR PRODUCTION.
-- See docs/ability-audit.md for required staged validation and balance choices.
create table public.player_ability_state(
 guild_id uuid not null references public.guilds(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 settings jsonb not null default '{}'::jsonb,
 primary key(guild_id,user_id));
alter table public.player_ability_state enable row level security;
create policy ability_state_self on public.player_ability_state for select to authenticated
 using(user_id=(select auth.uid()) and public.is_guild_member(guild_id));
grant select on public.player_ability_state to authenticated;
revoke all on public.player_ability_state from anon;
create table public.player_ability_uses(
 guild_id uuid not null references public.guilds(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 ability text not null,week_key date not null,reward_id uuid not null,reward_kind text not null,
 selection text,primary key(guild_id,user_id,ability,week_key));
alter table public.player_ability_uses enable row level security;
create policy ability_uses_self on public.player_ability_uses for select to authenticated
 using(user_id=(select auth.uid()) and public.is_guild_member(guild_id));
grant select on public.player_ability_uses to authenticated;
revoke all on public.player_ability_uses from anon;
create or replace function game_private.fitness_quest(q public.quest_templates)
returns boolean language sql immutable set search_path='' as $f$
 select lower(q.category) in ('fitness','training','gym') or q.key in ('go-for-a-run','long-dog-walk','walk-arthur');
$f$;
revoke all on function game_private.fitness_quest(public.quest_templates) from public,anon,authenticated;

create or replace function public.rank_ability_state()
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare gid uuid;d date;s jsonb;lvl int;used jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 d:=public.qb_effective_date(gid);
 select settings into s from public.player_ability_state where guild_id=gid and user_id=auth.uid();
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid();
 select coalesce(jsonb_agg(ability),'[]') into used from public.player_ability_uses where guild_id=gid and user_id=auth.uid() and week_key=d-(extract(isodow from d)::int-1);
 return jsonb_build_object('settings',coalesce(s,'{}'),'used',used,'level',coalesce(lvl,1),'week',d-(extract(isodow from d)::int-1),'fitness_quests',
  (select coalesce(jsonb_agg(q.id),'[]') from public.quest_templates q where q.active and public.can_view_quest(q.id) and game_private.fitness_quest(q)));
end $f$;
revoke all on function public.rank_ability_state() from public,anon;
grant execute on function public.rank_ability_state() to authenticated;

create or replace function public.configure_rank_ability(p_ability text,p_value text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare gid uuid;uid uuid:=auth.uid();lvl int;s jsonb;q public.quest_templates;tid uuid;kind text;value text;required int;keys jsonb;cap int;
begin
 if uid is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=uid order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=uid;
 required:=case p_ability when 'second_wind' then 5 when 'contract' then 25 when 'favor' then 40 when 'masterwork' then 50 when 'pin' then 1 else null end;
 if required is null or coalesce(lvl,1)<required then raise exception 'Ability is not unlocked';end if;
 insert into public.player_ability_state(guild_id,user_id) values(gid,uid) on conflict do nothing;
 select settings into s from public.player_ability_state where guild_id=gid and user_id=uid for update;
 if p_value is null then raise exception 'Choose a value';end if;
 if p_value<>'' and p_ability in ('second_wind','contract') and exists(select 1 from public.player_ability_uses where guild_id=gid and user_id=uid and ability=p_ability and week_key=public.qb_effective_date(gid)-(extract(isodow from public.qb_effective_date(gid))::int-1)) then raise exception 'Ability already used this week';end if;
 if p_value='' then s:=s-p_ability;
 elsif p_ability in ('second_wind','contract','pin') then
  kind:=case when p_ability='second_wind' then split_part(p_value,':',1) else 'quest' end;
  value:=case when p_ability='second_wind' then split_part(p_value,':',2) else p_value end;tid:=value::uuid;
  if kind='training' and p_ability='second_wind' then
   if not exists(select 1 from public.training_assignments where id=tid and user_id=uid and guild_id=gid and assignment_date=public.qb_effective_date(gid) and completed_at is null) then raise exception 'Choose today''s unfinished workout';end if;
  elsif kind='quest' then
   select * into q from public.quest_templates where id=tid and guild_id=gid and active and not hidden_encounter;
   if not found or not public.can_view_quest(tid) then raise exception 'Quest unavailable';end if;
   if q.owner_type='individual' and not coalesce(q.assigned_user_id=uid or (q.assigned_user_id is null and lower(q.assignee_key)=(select lower(player_key) from public.guild_members where guild_id=gid and user_id=uid)),false) then raise exception 'Quest belongs to another player';end if;
   if p_ability='second_wind' and not game_private.fitness_quest(q) then raise exception 'Choose a fitness quest';end if;
   if p_ability<>'pin' and not (game_private.quest_cycle(q,uid,public.qb_effective_date(gid))->>'available')::boolean then raise exception 'Quest is not currently available';end if;
  else raise exception 'Unknown target';end if;
  if p_ability='pin' then
   keys:=coalesce(s->'pin','[]');cap:=case when lvl>=60 then 6 else 5 end;
   if keys @> jsonb_build_array(value) then select coalesce(jsonb_agg(x),'[]') into keys from jsonb_array_elements_text(keys) x where x<>value;
   else if jsonb_array_length(keys)>=cap then raise exception 'All % focus slots are occupied',cap;end if;keys:=keys||jsonb_build_array(value);end if;
   s:=jsonb_set(s,'{pin}',keys);
  else s:=jsonb_set(s,array[p_ability],to_jsonb(p_value));end if;
 elsif p_ability='favor' then
  if not exists(select 1 from public.quest_templates where guild_id=gid and active and public.can_view_quest(id) and category=p_value) then raise exception 'Choose an existing category';end if;
  s:=jsonb_set(s,'{favor}',to_jsonb(p_value));
 elsif p_ability='masterwork' then
  if p_value not in ('second_wind','rested','contract','rally','favor') then raise exception 'Choose an earlier ability';end if;
  s:=jsonb_set(s,'{masterwork}',to_jsonb(p_value));
 end if;
 update public.player_ability_state set settings=s where guild_id=gid and user_id=uid;
 return public.rank_ability_state();
end $f$;
revoke all on function public.configure_rank_ability(text,text) from public,anon;
grant execute on function public.configure_rank_ability(text,text) to authenticated;

create or replace function game_private.ability_bonus(gid uuid,uid uuid,base_xp int,award_xp int,category text,fitness boolean,coop boolean,kind text,target uuid,reward uuid,d date)
returns jsonb language plpgsql set search_path='' as $f$
declare s jsonb;lvl int;xp int;week date;bonus int:=0;parts jsonb:='[]';selected text;factor numeric;last_day date;rank int;newlvl int;item public.item_definitions;itemid uuid;inserted int;
begin
 insert into public.player_ability_state(guild_id,user_id) values(gid,uid) on conflict do nothing;
 select settings into s from public.player_ability_state where guild_id=gid and user_id=uid for update;
 select personal_xp,level into xp,lvl from public.player_progress_public where guild_id=gid and user_id=uid;
 week:=d-(extract(isodow from d)::int-1);
 selected:=kind||':'||target::text;
 if lvl>=5 and fitness and s->>'second_wind'=selected and not exists(select 1 from public.player_ability_uses where guild_id=gid and user_id=uid and ability='second_wind' and week_key=week) then
  factor:=1+case when lvl>=50 and s->>'masterwork'='second_wind' then .25 else 0 end;
  select coalesce(max(ps.rank),0) into rank from public.player_specializations ps where guild_id=gid and user_id=uid and specialization_key='Vanguard';
  if rank>=1 then factor:=factor+.25;end if;
  bonus:=bonus+round(base_xp*factor)::int;parts:=parts||jsonb_build_array('Second Wind');
  insert into public.player_ability_uses values(gid,uid,'second_wind',week,reward,kind,s->>'second_wind');
  s:=s-'second_wind';
 end if;
 if lvl>=25 and kind='quest' and s->>'contract'=target::text and not exists(select 1 from public.player_ability_uses where guild_id=gid and user_id=uid and ability='contract' and week_key=week) then
  bonus:=bonus+round(base_xp*(1+case when lvl>=50 and s->>'masterwork'='contract' then .25 else 0 end))::int;parts:=parts||jsonb_build_array('Witcher''s Contract');
  insert into public.player_ability_uses values(gid,uid,'contract',week,reward,kind,s->>'contract');s:=s-'contract';
 end if;
 if lvl>=20 and not exists(select 1 from public.player_ability_uses where guild_id=gid and user_id=uid and ability='rested' and week_key=week) then
  select max(day) into last_day from (
   select effective_date as day from public.quest_completions c where c.guild_id=gid and c.completed_by=uid and c.reversed_at is null and c.id<>reward
   union all select assignment_date from public.training_assignments a where a.guild_id=gid and a.user_id=uid and a.completed_at is not null and (kind<>'training' or a.id<>target)
  ) history;
  if last_day is not null and d-last_day>=3 then
   bonus:=bonus+round(base_xp*(case when lvl>=50 and s->>'masterwork'='rested' then .50 else .25 end))::int;
   parts:=parts||jsonb_build_array('Rested');insert into public.player_ability_uses values(gid,uid,'rested',week,reward,kind,null);
  end if;
 end if;
 if lvl>=30 and coop then bonus:=bonus+round(base_xp*(case when lvl>=50 and s->>'masterwork'='rally' then .20 else .10 end))::int;parts:=parts||jsonb_build_array('Rally');end if;
 if lvl>=75 and kind='quest' and mod(abs(hashtextextended(uid::text||':'||d::text,131)::numeric),100)<10 and not exists(select 1 from public.player_ability_uses where guild_id=gid and user_id=uid and ability='legendary:'||d and week_key=week) then
  bonus:=bonus+round(base_xp*.25)::int;parts:=parts||jsonb_build_array('Legendary Draw');insert into public.player_ability_uses values(gid,uid,'legendary:'||d,week,reward,kind,null);
 end if;
 if lvl>=40 and s->>'favor'=category then bonus:=bonus+round(base_xp*(case when lvl>=50 and s->>'masterwork'='favor' then .30 else .20 end))::int;parts:=parts||jsonb_build_array('Commander''s Favor');end if;
 select coalesce(max(ps.rank),0) into rank from public.player_specializations ps where guild_id=gid and user_id=uid and specialization_key='Archivist';
 if rank>=1 and (lower(category) in ('knowledge','growth') or target in (select id from public.quest_templates where key='finish-a-book')) then bonus:=bonus+round(base_xp*.10)::int;parts:=parts||jsonb_build_array('Deep Study');end if;
 if rank>=2 and kind='expedition' then bonus:=bonus+round(base_xp*.25)::int;parts:=parts||jsonb_build_array('Research Expedition');end if;
 select coalesce(max(ps.rank),0) into rank from public.player_specializations ps where guild_id=gid and user_id=uid and specialization_key='Vanguard';
 if rank>=2 and fitness then bonus:=bonus+round(base_xp*.10)::int;parts:=parts||jsonb_build_array('Battle Rhythm');end if;
 select coalesce(max(ps.rank),0) into rank from public.player_specializations ps where guild_id=gid and user_id=uid and specialization_key='Steward';
 if rank>=1 and lower(category) in ('home','tasks','finance','homestead') then bonus:=bonus+round(base_xp*.10)::int;parts:=parts||jsonb_build_array('Good Order');end if;
 update public.player_ability_state set settings=s where guild_id=gid and user_id=uid;
 return jsonb_build_object('bonus',bonus,'effects',parts);
end $f$;
revoke all on function game_private.ability_bonus(uuid,uuid,int,int,text,boolean,boolean,text,uuid,uuid,date) from public,anon,authenticated;


create table public.player_ability_awards(
 guild_id uuid not null references public.guilds(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reward_id uuid not null,reward_kind text not null,bonus int not null default 0,
 details jsonb not null default '{}',primary key(user_id,reward_id,reward_kind));
alter table public.player_ability_awards enable row level security;
create policy ability_awards_self on public.player_ability_awards for select to authenticated using(user_id=(select auth.uid()) and public.is_guild_member(guild_id));

create or replace function public.collect_rank_ability_bonus(p_kind text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare uid uuid:=auth.uid();gid uuid;d date;base int;award int;category text;fit boolean:=false;coop boolean:=false;target uuid;reward uuid;
 c public.quest_completions;q public.quest_templates;t public.training_assignments;e public.expeditions;evt public.activity_events;
 details jsonb;bonus int;xp int;oldlevel int;newlevel int;r int;item public.item_definitions;inserted int;rank int;cells jsonb;cell int;extra int;campaign uuid;cxp int:=0;
begin
 if uid is null then raise exception 'Authentication required';end if;
 if p_kind='quest' then
  select * into c from public.quest_completions where id=p_id for update;
  if not found or c.reversed_at is not null then raise exception 'Completion unavailable';end if;
  gid:=c.guild_id;d:=public.qb_effective_date(gid);
  if c.effective_date<>d or not public.is_guild_member(gid) then raise exception 'Use today''s completion';end if;
  select personal_xp_awarded into award from public.quest_completion_rewards where completion_id=c.id and user_id=uid for update;
  if not found then raise exception 'This completion did not reward you';end if;
  select * into q from public.quest_templates where id=c.quest_id;
  base:=q.xp_personal;
  if q.recurrence->>'type'='daily' and coalesce((q.recurrence->>'count_target')::int,1)>1 then base:=floor(base::numeric/(q.recurrence->>'count_target')::int)::int;end if;
  category:=q.category;fit:=game_private.fitness_quest(q);coop:=q.owner_type='co-op';target:=q.id;reward:=c.id;
 elsif p_kind='training' then
  select * into t from public.training_assignments where id=p_id and user_id=uid for update;
  if not found or t.completed_at is null or not public.is_guild_member(t.guild_id) then raise exception 'Training unavailable';end if;
  gid:=t.guild_id;d:=public.qb_effective_date(gid);
  if t.assignment_date<>d then raise exception 'Use today''s workout';end if;
  select * into evt from public.activity_events where guild_id=gid and actor_user_id=uid and event_type='training_complete' and metadata->>'training_assignment_id'=t.id::text order by created_at desc limit 1 for update;
  if not found then raise exception 'Training reward unavailable';end if;
  base:=t.xp_personal;award:=evt.personal_xp;category:='Fitness';fit:=true;target:=t.id;reward:=evt.id;
 elsif p_kind='expedition' then
  select * into e from public.expeditions where id=p_id for update;
  if not found or e.status<>'complete' or not public.is_guild_member(e.guild_id) then raise exception 'Expedition unavailable';end if;
  gid:=e.guild_id;d:=public.qb_effective_date(gid);
  select * into evt from public.activity_events where guild_id=gid and actor_user_id=uid and event_type='expedition' and message='Completed expedition: '||e.title and created_at=e.completed_at for update;
  if not found or (e.completed_at at time zone (select timezone from public.guilds where id=gid))::date<>d then raise exception 'Use an expedition you completed today';end if;
  base:=e.xp_personal;award:=evt.personal_xp;category:='Exploration';target:=e.id;reward:=e.id;
 else raise exception 'Unknown reward kind';end if;
 if exists(select 1 from public.player_ability_awards where user_id=uid and reward_id=reward and reward_kind=p_kind) then
  return jsonb_build_object('bonus',0,'already_collected',true);
 end if;
 select personal_xp into xp from public.player_progress_public where guild_id=gid and user_id=uid for update;
 oldlevel:=public.qb_level_for_xp(greatest(0,xp-award));
 details:=game_private.ability_bonus(gid,uid,base,award,category,fit,coop,p_kind,target,reward,d);bonus:=(details->>'bonus')::int;
 insert into public.player_ability_awards values(gid,uid,reward,p_kind,bonus,details);
 update public.player_progress_public set personal_xp=personal_xp+bonus,updated_at=now() where guild_id=gid and user_id=uid returning personal_xp into xp;
 newlevel:=public.qb_level_for_xp(xp);
 update public.player_progress_public set level=newlevel,rank_key=public.qb_rank_for_level(newlevel) where guild_id=gid and user_id=uid;
 if p_kind='quest' then
  update public.quest_completion_rewards set personal_xp_awarded=personal_xp_awarded+bonus,metadata=metadata||jsonb_build_object('abilities',details) where completion_id=c.id and user_id=uid;
  update public.activity_events set personal_xp=case when actor_user_id=uid then personal_xp+bonus else personal_xp end,
   metadata=jsonb_set(metadata,'{rewards}',(select jsonb_agg(jsonb_build_object('user_id',user_id,'personal_xp',personal_xp_awarded)) from public.quest_completion_rewards where completion_id=c.id))
   where event_type='quest_complete' and metadata->>'completion_id'=c.id::text;
 elsif p_kind in ('training','expedition') then
  update public.activity_events set personal_xp=personal_xp+bonus,metadata=metadata||jsonb_build_object('abilities',details) where id=evt.id;
 end if;
 -- Once per newly earned level, Loot Find adds challenge loot to the Pack's unclaimed rewards.
 if newlevel>=10 and newlevel>oldlevel then
  select * into item from public.item_definitions where active and kind='challenge' order by random() limit 1;
  if found then
   for r in greatest(10,oldlevel+1)..newlevel loop
    insert into public.reward_events(guild_id,event_key,event_type,metadata) values(gid,'level-loot:'||uid||':'||r,'level_loot',jsonb_build_object('user_id',uid,'level',r)) on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted>0 then insert into public.player_items(guild_id,owner_user_id,item_key,state,metadata) values(gid,uid,item.key,'unclaimed',jsonb_build_object('name',item.name,'rarity',item.rarity,'kind',item.kind,'description',item.description,'mechanics',item.mechanics,'level',r));end if;
   end loop;
  end if;
 end if;
 if p_kind='expedition' then
  select coalesce(max(ps.rank),0) into rank from public.player_specializations ps where guild_id=gid and user_id=uid and specialization_key='Pathfinder';
  if rank>=1 then
   select revealed_cells into cells from public.exploration_state where guild_id=gid for update;
   select n into cell from generate_series(0,24) n where n<>12 and not (coalesce(cells,'[]') @> to_jsonb(array[n])) order by random() limit 1;
   if cell is not null then update public.exploration_state set revealed_cells=revealed_cells||to_jsonb(cell),updated_at=now() where guild_id=gid;end if;
  end if;
  if rank>=2 then
   extra:=greatest(1,round(e.renown_reward*.20)::int);
   update public.exploration_state set renown=renown+extra,exploration_rank=case when renown+extra<5 then 'Home Territory' when renown+extra<12 then 'Beyond the Keep' when renown+extra<25 then 'Greater Wilds' else 'Open Road' end,updated_at=now() where guild_id=gid;
  end if;
 end if;
 if p_kind='quest' and c.completed_by=uid and lower(q.category) in ('home','tasks','finance','homestead') and exists(select 1 from public.player_specializations where guild_id=gid and user_id=uid and specialization_key='Steward' and rank>=2) then
  select id into campaign from public.campaigns where guild_id=gid and status='active' order by started_at desc limit 1 for update;
  if campaign is not null then
   cxp:=greatest(1,round(q.xp_campaign*.10)::int);
   select least(cxp,greatest(0,goal_xp-campaign_xp)) into cxp from public.campaigns where id=campaign;
   update public.campaigns set campaign_xp=campaign_xp+cxp,status=case when campaign_xp+cxp>=goal_xp then 'victory' else status end,
    completed_at=case when campaign_xp+cxp>=goal_xp then coalesce(completed_at,now()) else completed_at end,
    chapter_key=case when (campaign_xp+cxp)*100.0/nullif(goal_xp,0)>=100 then 'burden-ends' when (campaign_xp+cxp)*100.0/nullif(goal_xp,0)>=80 then 'burning-mountain' when (campaign_xp+cxp)*100.0/nullif(goal_xp,0)>=60 then 'beneath-mountain' when (campaign_xp+cxp)*100.0/nullif(goal_xp,0)>=40 then 'crossroads' when (campaign_xp+cxp)*100.0/nullif(goal_xp,0)>=20 then 'prancing-lantern' else 'road-from-home' end where id=campaign;
   insert into public.campaign_contributions(campaign_id,user_id,campaign_xp) values(campaign,uid,cxp) on conflict(campaign_id,user_id) do update set campaign_xp=public.campaign_contributions.campaign_xp+excluded.campaign_xp;
   update public.quest_completions set campaign_xp_awarded=campaign_xp_awarded+cxp where id=c.id;
   update public.activity_events set campaign_xp=campaign_xp+cxp where event_type='quest_complete' and metadata->>'completion_id'=c.id::text;
  end if;
 end if;
 details:=details||jsonb_build_object('campaign_bonus',cxp);
 if bonus>0 then
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,metadata)
  values(gid,uid,uid,'ability_bonus','Applied ability bonuses: '||array_to_string(array(select jsonb_array_elements_text(details->'effects')),', '),'guild',bonus,jsonb_build_object('reward_id',reward,'reward_kind',p_kind,'abilities',details));
 end if;
 return details;
end $f$;
revoke all on function public.collect_rank_ability_bonus(text,uuid) from public,anon;
grant execute on function public.collect_rank_ability_bonus(text,uuid) to authenticated;

create or replace function public.choose_signet(p_specialization_key text)
returns jsonb language plpgsql security definer set search_path='' as $f$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if not exists(select 1 from public.player_progress_public where user_id=auth.uid() and level>=15 and public.is_guild_member(guild_id)) then raise exception 'Signet unlocks at level 15';end if;
 return public.choose_specialization(p_specialization_key);
end $f$;
revoke all on function public.choose_signet(text) from public,anon;
grant execute on function public.choose_signet(text) to authenticated;

create or replace function public.claim_prestige()
returns jsonb language plpgsql security definer set search_path='' as $f$
declare uid uuid:=auth.uid();gid uuid;lvl int;s jsonb;tier int;item public.item_definitions;itemid uuid;total int;
begin
 if uid is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=uid order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 insert into public.player_ability_state(guild_id,user_id) values(gid,uid) on conflict do nothing;
 select settings into s from public.player_ability_state where guild_id=gid and user_id=uid for update;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=uid;
 tier:=coalesce((s->>'prestige')::int,0)+1;
 if coalesce(lvl,1)<100+25*(tier-1) then raise exception 'Next Prestige milestone requires level %',100+25*(tier-1);end if;
 select * into item from public.item_definitions where active and kind='gear' and rarity in ('epic','legendary')
 and not exists(select 1 from public.player_items where guild_id=gid and owner_user_id=uid and item_key=key and state<>'discarded')
 order by case rarity when 'legendary' then 0 else 1 end,random() limit 1;
 if found then
  insert into public.player_items(guild_id,owner_user_id,item_key,state,metadata) values(gid,uid,item.key,'unclaimed',jsonb_build_object('name',item.name,'rarity',item.rarity,'kind',item.kind,'slot',item.slot,'description',item.description,'mechanics',item.mechanics,'prestige',tier)) returning id into itemid;
 end if;
 update public.player_progress_public set personal_xp=personal_xp+500,updated_at=now() where guild_id=gid and user_id=uid returning personal_xp into total;
 update public.player_progress_public set level=public.qb_level_for_xp(total),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(total)) where guild_id=gid and user_id=uid;
 update public.player_ability_state set settings=jsonb_set(settings,'{prestige}',to_jsonb(tier)) where guild_id=gid and user_id=uid;
 insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,metadata) values(gid,uid,uid,'prestige','Earned Prestige '||tier,'guild',500,jsonb_build_object('tier',tier,'item_id',itemid));
 return jsonb_build_object('tier',tier,'personal_xp',500,'item_id',itemid);
end $f$;
revoke all on function public.claim_prestige() from public,anon;
grant execute on function public.claim_prestige() to authenticated;

revoke all on public.player_ability_state,public.player_ability_uses,public.player_ability_awards from authenticated;
grant select on public.player_ability_state,public.player_ability_uses,public.player_ability_awards to authenticated;
revoke all on public.player_ability_awards from anon;
