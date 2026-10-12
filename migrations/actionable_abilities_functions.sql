CREATE OR REPLACE FUNCTION game_private.apply_quest_perks(p_completion uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.quest_completions;q public.quest_templates;r public.quest_completion_rewards;s jsonb;lvl int;xp int;base int;cb int;target int;step int;
 bonus int;actor_bonus int:=0;effects jsonb;details jsonb:='[]';rank int;week date;camp public.campaigns;campaign_bonus int:=0;actor_campaign int:=0;rewards jsonb;chosen boolean;legendary boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into c from public.quest_completions where id=p_completion for update;
 if not found or c.reversed_at is not null or c.completed_by<>auth.uid() or not public.is_guild_member(c.guild_id) then raise exception 'Completion unavailable';end if;
 if c.effective_date<>public.qb_effective_date(c.guild_id) then raise exception 'Use today''s completion';end if;
 select * into q from public.quest_templates where id=c.quest_id;
 base:=q.xp_personal;cb:=q.xp_campaign;
 if q.recurrence->>'type'='daily' then
  target:=greatest(1,coalesce((q.recurrence->>'count_target')::int,1));
  if target>1 then
   step:=substring(c.occurrence_key from ':step:([0-9]+)$')::int;base:=floor(q.xp_personal::numeric/target)::int;cb:=floor(q.xp_campaign::numeric/target)::int;
   if step=target then base:=q.xp_personal-base*(target-1);cb:=q.xp_campaign-cb*(target-1);end if;
  end if;
 end if;
 if not exists(select 1 from public.quest_completion_rewards where completion_id=c.id and not coalesce((metadata->>'quest_perks_applied')::boolean,false)) then
  select jsonb_agg(jsonb_build_object('user_id',user_id,'personal_xp',personal_xp_awarded)) into rewards from public.quest_completion_rewards where completion_id=c.id;
  return jsonb_build_object('actor_bonus',0,'campaign_bonus',0,'ability_rewards','[]'::jsonb,'rewards',coalesce(rewards,'[]'::jsonb));
 end if;
 week:=c.effective_date-(extract(isodow from c.effective_date)::int-1);
 for r in select * from public.quest_completion_rewards where completion_id=c.id order by user_id for update loop
  if coalesce((r.metadata->>'quest_perks_applied')::boolean,false) then continue;end if;
  select personal_xp into xp from public.player_progress_public where guild_id=c.guild_id and user_id=r.user_id for update;
  lvl:=public.qb_level_for_xp(greatest(0,xp-r.personal_xp_awarded));
  insert into public.ability_preferences(guild_id,user_id) values(c.guild_id,r.user_id) on conflict do nothing;
  select choices into s from public.ability_preferences where guild_id=c.guild_id and user_id=r.user_id for update;
  bonus:=0;effects:='[]';campaign_bonus:=0;legendary:=false;
  chosen:=not (s ? '_updated_at') or (s->>'_updated_at')::timestamptz<=c.completed_at;
  if lvl>=25 and chosen and s->>'contract'=q.id::text and not exists(select 1 from public.contract_uses where guild_id=c.guild_id and user_id=r.user_id and week_key=week) then
   bonus:=bonus+round(base*(case when lvl>=50 and s->>'masterwork'='contract' then 1.25 else 1 end))::int;
   effects:=effects||jsonb_build_array('Witcher''s Contract');
   insert into public.contract_uses values(c.guild_id,r.user_id,week,c.id,bonus);
   update public.ability_preferences set choices=choices-'contract' where guild_id=c.guild_id and user_id=r.user_id;
  end if;
  if lvl>=30 and q.owner_type='co-op' then
   bonus:=bonus+round(base*(case when lvl>=50 and chosen and s->>'masterwork'='rally' then .20 else .10 end))::int;effects:=effects||jsonb_build_array('Rally');
  end if;
  if lvl>=40 and chosen and s->>'favor'=q.category then
   bonus:=bonus+round(base*(case when lvl>=50 and s->>'masterwork'='favor' then .30 else .20 end))::int;effects:=effects||jsonb_build_array('Commander''s Favor');
  end if;
  if lvl>=50 and chosen and s->>'masterwork'='rested' and coalesce((r.metadata->>'rested_bonus')::int,0)>0 then
   bonus:=bonus+round(base*.25)::int;effects:=effects||jsonb_build_array('Masterwork: Rested');
  end if;
  if lvl>=50 and chosen and s->>'masterwork'='second_wind' and exists(select 1 from jsonb_array_elements(c.modifiers) m where m->>'name'='Second Wind' and m->>'user_id'=r.user_id::text) then
   bonus:=bonus+round(base*.25)::int;effects:=effects||jsonb_build_array('Masterwork: Second Wind');
  end if;
  if lvl>=75 and mod(abs(hashtextextended(c.guild_id::text||':'||r.user_id::text||':'||c.effective_date::text,97)::numeric),100)<10
   and not exists(select 1 from public.quest_completion_rewards lr join public.quest_completions lc on lc.id=lr.completion_id
    where lc.guild_id=c.guild_id and lr.user_id=r.user_id and lr.metadata->>'legendary_draw_date'=c.effective_date::text) then
   bonus:=bonus+round(base*.25)::int;legendary:=true;effects:=effects||jsonb_build_array('Legendary Fortune');
  end if;
  if lvl>=15 then
   select coalesce(max(ps.rank),0) into rank from public.player_specializations ps where guild_id=c.guild_id and user_id=r.user_id and specialization_key='Archivist';
   if rank>=1 and (lower(q.category) in ('knowledge','growth') or q.key='finish-a-book') then bonus:=bonus+round(base*.10)::int;effects:=effects||jsonb_build_array('Deep Study');end if;
   select coalesce(max(ps.rank),0) into rank from public.player_specializations ps where guild_id=c.guild_id and user_id=r.user_id and specialization_key='Vanguard';
   if rank>=1 and exists(select 1 from jsonb_array_elements(c.modifiers) m where m->>'name'='Second Wind' and m->>'user_id'=r.user_id::text) then bonus:=bonus+round(base*.25)::int;effects:=effects||jsonb_build_array('Vanguard: Second Wind');end if;
   if rank>=2 and (lower(q.category) in ('fitness','training','gym') or q.key in ('go-for-a-run','long-dog-walk','walk-arthur')) then bonus:=bonus+round(base*.10)::int;effects:=effects||jsonb_build_array('Battle Rhythm');end if;
   select coalesce(max(ps.rank),0) into rank from public.player_specializations ps where guild_id=c.guild_id and user_id=r.user_id and specialization_key='Steward';
   if rank>=1 and lower(q.category) in ('home','tasks','homestead','finance','garage') then
    bonus:=bonus+round(base*.10)::int;effects:=effects||jsonb_build_array('Good Order');
    if rank>=2 and r.user_id=c.completed_by then
     select * into camp from public.campaigns where guild_id=c.guild_id and status='active' order by started_at desc limit 1 for update;
     if found then
      campaign_bonus:=least(greatest(0,camp.goal_xp-camp.campaign_xp),round(cb*.10)::int);
      update public.campaigns set campaign_xp=campaign_xp+campaign_bonus,status=case when campaign_xp+campaign_bonus>=goal_xp then 'victory' else status end,
       completed_at=case when campaign_xp+campaign_bonus>=goal_xp then coalesce(completed_at,now()) else completed_at end,
       chapter_key=case when (campaign_xp+campaign_bonus)*100.0/nullif(goal_xp,0)>=100 then 'burden-ends' when (campaign_xp+campaign_bonus)*100.0/nullif(goal_xp,0)>=80 then 'burning-mountain' when (campaign_xp+campaign_bonus)*100.0/nullif(goal_xp,0)>=60 then 'beneath-mountain' when (campaign_xp+campaign_bonus)*100.0/nullif(goal_xp,0)>=40 then 'crossroads' when (campaign_xp+campaign_bonus)*100.0/nullif(goal_xp,0)>=20 then 'prancing-lantern' else 'road-from-home' end where id=camp.id;
      update public.campaign_contributions set campaign_xp=campaign_xp+campaign_bonus where campaign_id=camp.id and user_id=r.user_id;
      actor_campaign:=campaign_bonus;effects:=effects||jsonb_build_array('Guild Provisioner');
     end if;
    end if;
   end if;
  end if;
  update public.quest_completion_rewards set personal_xp_awarded=personal_xp_awarded+bonus,metadata=metadata||jsonb_build_object('quest_perks_applied',true,'ability_effects',effects,'ability_bonus',bonus)||case when legendary then jsonb_build_object('legendary_draw_date',c.effective_date) else '{}'::jsonb end where completion_id=c.id and user_id=r.user_id;
  update public.player_progress_public set personal_xp=personal_xp+bonus,updated_at=now() where guild_id=c.guild_id and user_id=r.user_id returning personal_xp into xp;
  update public.player_progress_public set level=public.qb_level_for_xp(xp),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(xp)) where guild_id=c.guild_id and user_id=r.user_id;
  if r.user_id=auth.uid() then actor_bonus:=bonus;end if;
  if bonus>0 or campaign_bonus>0 then details:=details||jsonb_build_array(jsonb_build_object('user_id',r.user_id,'bonus',bonus,'campaign_bonus',campaign_bonus,'effects',effects));end if;
 end loop;
 select jsonb_agg(jsonb_build_object('user_id',user_id,'personal_xp',personal_xp_awarded)) into rewards from public.quest_completion_rewards where completion_id=c.id;
 update public.quest_completions set campaign_xp_awarded=campaign_xp_awarded+actor_campaign,modifiers=modifiers||jsonb_build_array(jsonb_build_object('kind','ability','name','Ability bonuses','rewards',details)) where id=c.id;
 update public.activity_events set personal_xp=personal_xp+actor_bonus,campaign_xp=campaign_xp+actor_campaign,
  metadata=jsonb_set(metadata,'{rewards}',rewards)||jsonb_build_object('ability_rewards',details) where event_type='quest_complete' and actor_user_id=auth.uid() and metadata->>'completion_id'=c.id::text;
 return jsonb_build_object('actor_bonus',actor_bonus,'campaign_bonus',actor_campaign,'ability_rewards',details,'rewards',rewards);
end $function$;

CREATE OR REPLACE FUNCTION game_private.apply_training_perks(p_assignment uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.training_assignments;evt public.activity_events;xp int;lvl int;v_rank int;bonus int:=0;s jsonb;effects jsonb:='[]';
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into a from public.training_assignments where id=p_assignment and user_id=auth.uid() for update;
 if not found or a.completed_at is null or not public.is_guild_member(a.guild_id) then raise exception 'Workout unavailable';end if;
 select * into evt from public.activity_events where actor_user_id=auth.uid() and guild_id=a.guild_id and event_type='training_complete' and metadata->>'training_assignment_id'=a.id::text order by created_at desc,id desc limit 1 for update;
 if not found then raise exception 'Workout reward unavailable';end if;
 if coalesce((evt.metadata->>'ability_perks_applied')::boolean,false) then return p_result;end if;
 select personal_xp into xp from public.player_progress_public where guild_id=a.guild_id and user_id=auth.uid() for update;
 lvl:=public.qb_level_for_xp(greatest(0,xp-evt.personal_xp));
 select choices into s from public.ability_preferences where guild_id=a.guild_id and user_id=auth.uid();
 if lvl>=15 then
  select coalesce(max(rank),0) into v_rank from public.player_specializations where guild_id=a.guild_id and user_id=auth.uid() and specialization_key='Vanguard';
  if v_rank>=1 and coalesce((evt.metadata->>'second_wind_bonus')::int,0)>0 then bonus:=bonus+round(a.xp_personal*.25)::int;effects:=effects||jsonb_build_array('Vanguard: Second Wind');end if;
  if v_rank>=2 then bonus:=bonus+round(a.xp_personal*.10)::int;effects:=effects||jsonb_build_array('Battle Rhythm');end if;
 end if;
 if lvl>=50 and s->>'masterwork'='second_wind' and coalesce((evt.metadata->>'second_wind_bonus')::int,0)>0 then
  bonus:=bonus+round(a.xp_personal*.25)::int;effects:=effects||jsonb_build_array('Masterwork: Second Wind');
 end if;
 update public.player_progress_public set personal_xp=personal_xp+bonus,updated_at=now() where guild_id=a.guild_id and user_id=auth.uid() returning personal_xp into xp;
 update public.player_progress_public set level=public.qb_level_for_xp(xp),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(xp)) where guild_id=a.guild_id and user_id=auth.uid();
 update public.activity_events set personal_xp=personal_xp+bonus,metadata=metadata||jsonb_build_object('ability_perks_applied',true,'ability_bonus',bonus,'ability_effects',effects) where id=evt.id;
 return p_result||jsonb_build_object('personal_xp',(p_result->>'personal_xp')::int+bonus,'ability_bonus',bonus,'ability_effects',effects);
end $function$;

CREATE OR REPLACE FUNCTION public.ability_milestones_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare gid uuid;lvl int;loot_level int;prestige_level int;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid();
 select min(n) into loot_level from generate_series(10,coalesce(lvl,1),5) n where not exists(select 1 from public.reward_events where guild_id=gid and event_key='ability-challenge:'||auth.uid()::text||':'||n::text);
 select min(n) into prestige_level from generate_series(100,coalesce(lvl,1),25) n where not exists(select 1 from public.reward_events where guild_id=gid and event_key='prestige:'||auth.uid()::text||':'||n::text);
 return jsonb_build_object('level',coalesce(lvl,1),'loot_find_level',loot_level,'prestige_level',prestige_level,
 'prestige_count',(select count(*) from public.reward_events where guild_id=gid and event_key like 'prestige:'||auth.uid()::text||':%'));
end $function$;

CREATE OR REPLACE FUNCTION public.ability_preferences_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.choose_specialization(p_specialization_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=auth.uid(); v_guild uuid; v_level integer; v_spent integer; v_earned integer; v_available integer;
  v_rank integer:=0; v_active integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_specialization_key not in ('Archivist','Vanguard','Pathfinder','Steward') then raise exception 'Unknown specialization'; end if;
  select guild_id into v_guild from public.guild_members where user_id=v_uid limit 1;
  if v_guild is null then raise exception 'Guild membership required'; end if;
  select coalesce(level,1) into v_level from public.player_progress_public where guild_id=v_guild and user_id=v_uid for update;
  if coalesce(v_level,1)<15 then raise exception 'Signet unlocks at level 15';end if;
  v_earned:=1+floor(v_level/10.0)::integer;
  select coalesce(sum(rank),0),count(*) filter(where rank>0) into v_spent,v_active from public.player_specializations where guild_id=v_guild and user_id=v_uid;
  select coalesce(rank,0) into v_rank from public.player_specializations where guild_id=v_guild and user_id=v_uid and specialization_key=p_specialization_key;
  if not found then v_rank:=0; end if;
  v_available:=v_earned-v_spent;
  if v_available<=0 then raise exception 'No Specialization Points available'; end if;
  if v_rank>=2 then raise exception 'Maximum rank reached'; end if;
  if v_rank=0 and v_active>=3 then raise exception 'Maximum 3 active specializations'; end if;
  insert into public.player_specializations(guild_id,user_id,specialization_key,rank)
  values(v_guild,v_uid,p_specialization_key,1)
  on conflict(guild_id,user_id,specialization_key) do update set rank=public.player_specializations.rank+1,updated_at=now()
  returning rank into v_rank;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
  values(v_guild,v_uid,v_uid,'specialization','Deepened specialization: '||p_specialization_key,'private',jsonb_build_object('specialization',p_specialization_key,'rank',v_rank));
  return jsonb_build_object('specialization',p_specialization_key,'rank',v_rank,'points_remaining',v_available-1);
end; $function$;

CREATE OR REPLACE FUNCTION public.claim_ability_milestone(p_ability text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb;gid uuid;lvl int;milestone int;k text;d public.item_definitions;item uuid;bonus int:=0;xp int;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid() for update;
 s:=public.ability_milestones_state();
 if p_ability='loot_find' then milestone:=(s->>'loot_find_level')::int;k:='ability-challenge:';
 elsif p_ability='prestige' then milestone:=(s->>'prestige_level')::int;k:='prestige:';bonus:=500;
 else raise exception 'Choose Loot Find or Prestige';end if;
 if milestone is null then raise exception 'No unclaimed milestone available';end if;
 k:=k||auth.uid()::text||':'||milestone::text;
 if p_ability='loot_find' then select * into d from public.item_definitions where key='gauntlet-token' and active and kind='challenge';
 else
  select * into d from public.item_definitions where active and kind='gear' and rarity in ('epic','legendary')
   order by -ln(greatest(random(),0.000001))/case when exists(select 1 from public.player_items where owner_user_id=auth.uid() and item_key=public.item_definitions.key) then .12 else 1 end limit 1;
 end if;
 if not found then raise exception 'Reward catalog unavailable';end if;
 insert into public.reward_events(guild_id,event_key,event_type,metadata) values(gid,k,'ability_milestone',jsonb_build_object('user_id',auth.uid(),'ability',p_ability,'level',milestone));
 insert into public.player_items(guild_id,owner_user_id,item_key,state,metadata,acquired_at)
 values(gid,auth.uid(),d.key,'unclaimed',jsonb_build_object('name',d.name,'icon',d.icon,'rarity',d.rarity,'kind',d.kind,'slot',d.slot,'description',d.description,'mechanics',d.mechanics,'ability',p_ability,'milestone',milestone),clock_timestamp()) returning id into item;
 update public.reward_events set metadata=metadata||jsonb_build_object('item_id',item,'personal_xp',bonus) where guild_id=gid and event_key=k;
 if bonus>0 then
  update public.player_progress_public set personal_xp=personal_xp+bonus,updated_at=now() where guild_id=gid and user_id=auth.uid() returning personal_xp into xp;
  update public.player_progress_public set level=public.qb_level_for_xp(xp),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(xp)) where guild_id=gid and user_id=auth.uid();
 end if;
 insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,metadata)
 values(gid,auth.uid(),auth.uid(),'ability_milestone',case when p_ability='loot_find' then 'Loot Find: ' else 'Prestige: ' end||d.name,'private',bonus,jsonb_build_object('ability',p_ability,'level',milestone,'item_id',item));
 return jsonb_build_object('item_id',item,'item_name',d.name,'milestone',milestone,'personal_xp',bonus);
end $function$;

CREATE OR REPLACE FUNCTION public.complete_expedition_abilities(p_expedition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.expeditions;r jsonb;gid uuid;lvl int;xp int;ar int;pr int;bonus int:=0;renown_bonus int:=0;cells jsonb;cell int;total_renown int;rank_text text;effects jsonb:='[]';
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into e from public.expeditions where id=p_expedition_id for update;
 if not found or not public.is_guild_member(e.guild_id) then raise exception 'Expedition unavailable';end if;
 select level into lvl from public.player_progress_public where guild_id=e.guild_id and user_id=auth.uid() for update;
 r:=public.complete_expedition(p_expedition_id);
 if lvl>=15 then
  select coalesce(max(rank),0) into ar from public.player_specializations where guild_id=e.guild_id and user_id=auth.uid() and specialization_key='Archivist';
  select coalesce(max(rank),0) into pr from public.player_specializations where guild_id=e.guild_id and user_id=auth.uid() and specialization_key='Pathfinder';
  if ar>=2 then bonus:=round(e.xp_personal*.25)::int;effects:=effects||jsonb_build_array('Research Expedition');end if;
  select revealed_cells,public.exploration_state.renown into cells,total_renown from public.exploration_state where guild_id=e.guild_id for update;
  if pr>=1 then
   select n into cell from generate_series(0,24) n where n<>12 and not(cells @> to_jsonb(array[n])) order by random() limit 1;
   if cell is not null then cells:=cells||to_jsonb(cell);end if;effects:=effects||jsonb_build_array('Cartographer');
  end if;
  if pr>=2 then renown_bonus:=greatest(1,round(e.renown_reward*.20)::int);total_renown:=total_renown+renown_bonus;effects:=effects||jsonb_build_array('Farther Roads');end if;
  rank_text:=case when total_renown<5 then 'Home Territory' when total_renown<12 then 'Beyond the Keep' when total_renown<25 then 'Greater Wilds' else 'Open Road' end;
  update public.exploration_state set revealed_cells=cells,renown=total_renown,exploration_rank=rank_text,updated_at=now() where guild_id=e.guild_id;
  update public.player_progress_public set personal_xp=personal_xp+bonus,updated_at=now() where guild_id=e.guild_id and user_id=auth.uid() returning personal_xp into xp;
  update public.player_progress_public set level=public.qb_level_for_xp(xp),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(xp)) where guild_id=e.guild_id and user_id=auth.uid();
 end if;
 update public.expeditions set metadata=metadata||jsonb_build_object('completed_by',auth.uid(),'ability_bonus',bonus,'ability_effects',effects,'renown_bonus',renown_bonus,'extra_revealed_cell',cell) where id=e.id;
 update public.activity_events set personal_xp=personal_xp+bonus,metadata=metadata||jsonb_build_object('expedition_id',e.id,'ability_bonus',bonus,'ability_effects',effects,'renown',(r->>'renown')::int+renown_bonus,'renown_bonus',renown_bonus,'extra_revealed_cell',cell)
 where guild_id=e.guild_id and actor_user_id=auth.uid() and event_type='expedition' and message='Completed expedition: '||e.title and created_at=now();
 return r||jsonb_build_object('personal_xp',(r->>'personal_xp')::int+bonus,'ability_bonus',bonus,'ability_effects',effects,'renown',(r->>'renown')::int+renown_bonus,'renown_bonus',renown_bonus,'extra_revealed_cell',cell,'exploration_rank',coalesce(rank_text,r->>'exploration_rank'));
end $function$;

CREATE OR REPLACE FUNCTION public.complete_gauntlet_abilities(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;b jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 r:=public.complete_gauntlet_rested(p_challenge_id);
 if r->>'quest_completion_id' is not null then
  b:=game_private.apply_quest_perks((r->>'quest_completion_id')::uuid);r:=r||jsonb_build_object('ability_rewards',b->'ability_rewards');
  if r->'quest_reward' is not null and r->'quest_reward'<>'null'::jsonb then
   r:=jsonb_set(r,'{quest_reward}',r->'quest_reward'||jsonb_build_object('personal_xp_each',(r#>>'{quest_reward,personal_xp_each}')::int+(b->>'actor_bonus')::int,'campaign_xp',(r#>>'{quest_reward,campaign_xp}')::int+(b->>'campaign_bonus')::int,'rewards',b->'rewards'));
  else r:=r||jsonb_build_object('personal_xp',coalesce((r->>'personal_xp')::int,0)+(b->>'actor_bonus')::int,'campaign_xp',coalesce((r->>'campaign_xp')::int,0)+(b->>'campaign_bonus')::int);end if;
 end if;
 return r;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_quest_abilities(p_quest_id uuid, p_occurrence_key text, p_source text DEFAULT 'journal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;bonus jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 result:=public.complete_quest_rested(p_quest_id,p_occurrence_key,p_source);bonus:=game_private.apply_quest_perks((result->>'completion_id')::uuid);
 return result||jsonb_build_object('ability_rewards',bonus->'ability_rewards','rewards',bonus->'rewards','personal_xp_each',(result->>'personal_xp_each')::int+(bonus->>'actor_bonus')::int,'campaign_xp',(result->>'campaign_xp')::int+(bonus->>'campaign_bonus')::int);
end $function$;

CREATE OR REPLACE FUNCTION public.complete_training_abilities(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 r:=public.complete_training_assignment(p_assignment_id);return game_private.apply_training_perks(p_assignment_id,r);
end $function$;

CREATE OR REPLACE FUNCTION public.legendary_draw_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare gid uuid;lvl int;d date;rare boolean;used boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid();d:=public.qb_effective_date(gid);
 rare:=coalesce(lvl,1)>=75 and mod(abs(hashtextextended(gid::text||':'||auth.uid()::text||':'||d::text,97)::numeric),100)<10;
 used:=exists(select 1 from public.quest_completion_rewards r join public.quest_completions c on c.id=r.completion_id where c.guild_id=gid and r.user_id=auth.uid() and r.metadata->>'legendary_draw_date'=d::text);
 return jsonb_build_object('unlocked',coalesce(lvl,1)>=75,'date',d,'rare',rare,'used',used,'ready',rare and not used,'chance_pct',10,'bonus_pct',25);
end $function$;

CREATE OR REPLACE FUNCTION public.qb_level_up_reward_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_milestone integer; v_key text; v_def public.item_definitions%rowtype; v_item uuid;
begin
  if new.level is null or old.level is null or new.level<=old.level then return new; end if;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
  values(new.guild_id,new.user_id,new.user_id,'level_up','Reached Level '||new.level,'guild',jsonb_build_object('old_level',old.level,'new_level',new.level));
  v_milestone := (new.level/5)*5;
  if v_milestone>=5 and v_milestone>old.level then
    v_key:='level-loot:'||new.user_id::text||':'||v_milestone::text;
    begin
      insert into public.reward_events(guild_id,event_key,event_type,metadata) values(new.guild_id,v_key,'level_loot',jsonb_build_object('user_id',new.user_id,'level',v_milestone));
    exception when unique_violation then return new; end;
    select d.* into v_def from public.item_definitions d where d.active and d.kind='gear'
     and (d.key is distinct from(select item_key from public.player_items where owner_user_id=new.user_id order by acquired_at desc,id desc limit 1)
      or not exists(select 1 from public.item_definitions alt where alt.active and alt.kind='gear' and alt.key<>d.key))
     order by -ln(greatest(random(),0.000001))/(case d.rarity when 'common' then 6 when 'uncommon' then 4 when 'rare' then 2 when 'epic' then 1 else .25 end
      *case when exists(select 1 from public.player_items pi where pi.owner_user_id=new.user_id and pi.item_key=d.key) then .12 else 1 end) limit 1;
    if found then
      insert into public.player_items(guild_id,owner_user_id,item_key,state,metadata,acquired_at)
      values(new.guild_id,new.user_id,v_def.key,'unclaimed',jsonb_build_object('name',v_def.name,'icon',v_def.icon,'rarity',v_def.rarity,'kind',v_def.kind,'slot',v_def.slot,'description',v_def.description,'mechanics',v_def.mechanics,'level_reward',v_milestone),clock_timestamp()) returning id into v_item;
      update public.reward_events set metadata=metadata||jsonb_build_object('item_id',v_item,'item_key',v_def.key,'item_name',v_def.name,'rarity',v_def.rarity) where guild_id=new.guild_id and event_key=v_key;
      insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
      values(new.guild_id,new.user_id,new.user_id,'loot_drop','Milestone cache: '||v_def.name,'guild',jsonb_build_object('item_id',v_item,'level',v_milestone,'rarity',v_def.rarity));
    end if;
  end if;
  return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.qb_maybe_award_loot(p_guild uuid, p_user uuid, p_tier text, p_major boolean, p_completion uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_state public.player_loot_state%rowtype; v_chance numeric; v_roll numeric; v_def public.item_definitions%rowtype; v_item uuid; v_tier text:=lower(coalesce(p_tier,'medium')); v_allowed text[];
begin
  if auth.uid() is null or not public.is_guild_member(p_guild) or not exists(
   select 1 from public.quest_completions c join public.quest_completion_rewards r on r.completion_id=c.id
    where c.id=p_completion and c.guild_id=p_guild and c.completed_by=auth.uid() and c.reversed_at is null and r.user_id=p_user
  ) then raise exception 'Authorized quest reward required';end if;
  if exists(select 1 from public.reward_events where guild_id=p_guild and event_key='quest-loot:'||p_completion::text||':'||p_user::text) then return null;end if;
  insert into public.player_loot_state(guild_id,user_id) values(p_guild,p_user) on conflict(guild_id,user_id) do nothing;
  select * into v_state from public.player_loot_state where guild_id=p_guild and user_id=p_user for update;
  v_chance:=case v_tier when 'low' then .015 when 'high' then .05 else .025 end;
  if coalesce(p_major,false) then v_chance:=greatest(v_chance,.15); end if;
  if v_state.pity_count>=15 then v_chance:=least(.40,v_chance+(v_state.pity_count-14)*.01); end if;
  v_roll:=random();
  if v_state.pity_count<24 and v_roll>=v_chance then
    update public.player_loot_state set pity_count=pity_count+1,updated_at=now() where guild_id=p_guild and user_id=p_user;
    return null;
  end if;
  if coalesce(p_major,false) then v_allowed:=array['rare','epic'];
  elsif v_tier='high' then v_allowed:=array['uncommon','rare','epic'];
  elsif v_tier='low' then v_allowed:=array['common','uncommon'];
  else v_allowed:=array['common','uncommon','rare']; end if;
  -- Successful drops include functioning, single-use uncommon items.
  if random()<.20 then
   select * into v_def from public.item_definitions where active and key in ('safe-passage','gauntlet-token') order by random() limit 1;
  end if;
  if v_def.key is null then
  -- Any gear is usable by either character. Repeats stay possible at reduced weight.
  select d.* into v_def from public.item_definitions d
   where d.active and d.kind='gear' and d.rarity=any(v_allowed)
    and (d.key is distinct from (select item_key from public.player_items where owner_user_id=p_user order by acquired_at desc,id desc limit 1)
     or not exists(select 1 from public.item_definitions alt where alt.active and alt.kind='gear' and alt.rarity=any(v_allowed) and alt.key<>d.key))
   order by -ln(greatest(random(),0.000001))/case when exists(select 1 from public.player_items pi where pi.owner_user_id=p_user and pi.item_key=d.key) then .12 else 1 end limit 1;
  if not found then
    select d.* into v_def from public.item_definitions d where d.active and d.kind='gear'
     order by -ln(greatest(random(),0.000001))/case when exists(select 1 from public.player_items pi where pi.owner_user_id=p_user and pi.item_key=d.key) then .12 else 1 end limit 1;
  end if;
  end if;
  if v_def.key is null then
    update public.player_loot_state set pity_count=pity_count+1,updated_at=now() where guild_id=p_guild and user_id=p_user;
    return null;
  end if;
  insert into public.player_items(guild_id,owner_user_id,item_key,state,metadata,acquired_at)
  values(p_guild,p_user,v_def.key,'unclaimed',jsonb_build_object('name',v_def.name,'icon',v_def.icon,'rarity',v_def.rarity,'kind',v_def.kind,'slot',v_def.slot,'description',v_def.description,'mechanics',v_def.mechanics,'natural_loot',true,'completion_id',p_completion),clock_timestamp()) returning id into v_item;
  update public.player_loot_state set pity_count=0,last_drop_at=now(),updated_at=now() where guild_id=p_guild and user_id=p_user;
  insert into public.reward_events(guild_id,event_key,event_type,metadata)
  values(p_guild,'quest-loot:'||p_completion::text||':'||p_user::text,'quest_loot',jsonb_build_object('completion_id',p_completion,'user_id',p_user,'item_id',v_item,'item_key',v_def.key,'rarity',v_def.rarity));
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
  values(p_guild,p_user,p_user,'loot_drop','Loot found: '||v_def.name,'private',jsonb_build_object('completion_id',p_completion,'item_id',v_item,'item_key',v_def.key,'rarity',v_def.rarity,'natural_loot',true));
  return jsonb_build_object('item_id',v_item,'item_key',v_def.key,'item_name',v_def.name,'rarity',v_def.rarity);
end $function$;

CREATE OR REPLACE FUNCTION public.set_ability_preference(p_key text, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 update public.ability_preferences set choices=s||jsonb_build_object('_updated_at',clock_timestamp()) where guild_id=gid and user_id=auth.uid();
 return public.ability_preferences_state();
end $function$;

CREATE OR REPLACE FUNCTION public.use_second_wind_abilities(p_kind text, p_target uuid, p_occurrence_key text DEFAULT NULL::text, p_source text DEFAULT 'journal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;b jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 r:=public.use_second_wind_rested(p_kind,p_target,p_occurrence_key,p_source);
 if p_kind='training' then return game_private.apply_training_perks(p_target,r);end if;
 b:=game_private.apply_quest_perks((r->>'completion_id')::uuid);
 return r||jsonb_build_object('personal_xp_each',(r->>'personal_xp_each')::int+(b->>'actor_bonus')::int,'campaign_xp',(r->>'campaign_xp')::int+(b->>'campaign_bonus')::int,'ability_rewards',b->'ability_rewards','rewards',b->'rewards');
end $function$;
revoke all on function game_private.apply_quest_perks(uuid) from public,anon,authenticated;
revoke all on function game_private.apply_training_perks(uuid,jsonb) from public,anon,authenticated;

revoke all on function public.ability_milestones_state() from public,anon;
grant execute on function public.ability_milestones_state() to authenticated;
revoke all on function public.ability_preferences_state() from public,anon;
grant execute on function public.ability_preferences_state() to authenticated;
revoke all on function game_private.apply_quest_perks(p_completion uuid) from public,anon,authenticated;
revoke all on function game_private.apply_training_perks(p_assignment uuid, p_result jsonb) from public,anon,authenticated;
revoke all on function public.choose_specialization(p_specialization_key text) from public,anon;
grant execute on function public.choose_specialization(p_specialization_key text) to authenticated;
revoke all on function public.claim_ability_milestone(p_ability text) from public,anon;
grant execute on function public.claim_ability_milestone(p_ability text) to authenticated;
revoke all on function public.complete_expedition_abilities(p_expedition_id uuid) from public,anon;
grant execute on function public.complete_expedition_abilities(p_expedition_id uuid) to authenticated;
revoke all on function public.complete_gauntlet_abilities(p_challenge_id uuid) from public,anon;
grant execute on function public.complete_gauntlet_abilities(p_challenge_id uuid) to authenticated;
revoke all on function public.complete_quest_abilities(p_quest_id uuid, p_occurrence_key text, p_source text) from public,anon;
grant execute on function public.complete_quest_abilities(p_quest_id uuid, p_occurrence_key text, p_source text) to authenticated;
revoke all on function public.complete_training_abilities(p_assignment_id uuid) from public,anon;
grant execute on function public.complete_training_abilities(p_assignment_id uuid) to authenticated;
revoke all on function public.legendary_draw_state() from public,anon;
grant execute on function public.legendary_draw_state() to authenticated;
revoke all on function public.qb_level_up_reward_trigger() from public,anon,authenticated;
revoke all on function public.qb_maybe_award_loot(p_guild uuid, p_user uuid, p_tier text, p_major boolean, p_completion uuid) from public,anon,authenticated;
revoke all on function public.set_ability_preference(p_key text, p_value text) from public,anon;
grant execute on function public.set_ability_preference(p_key text, p_value text) to authenticated;
revoke all on function public.use_second_wind_abilities(p_kind text, p_target uuid, p_occurrence_key text, p_source text) from public,anon;
grant execute on function public.use_second_wind_abilities(p_kind text, p_target uuid, p_occurrence_key text, p_source text) to authenticated;
