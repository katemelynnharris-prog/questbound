CREATE OR REPLACE FUNCTION public.complete_training_assignment(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=auth.uid(); v_a public.training_assignments%rowtype; v_total integer; v_level integer; v_campaign uuid;
  v_strength integer:=0; v_endurance integer:=0; v_agility integer:=0; v_mobility integer:=0; v_core integer:=0; v_grip integer:=0;
  v_pct numeric:=0; v_xp integer; v_bonus integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_a from public.training_assignments where id=p_assignment_id and user_id=v_uid for update;
  if not found then raise exception 'Training assignment unavailable'; end if;
  if v_a.completed_at is not null then raise exception 'Training assignment already completed'; end if;
  v_strength:=coalesce((v_a.stat_deltas->>'strength')::integer,0); v_endurance:=coalesce((v_a.stat_deltas->>'endurance')::integer,0); v_agility:=coalesce((v_a.stat_deltas->>'agility')::integer,0); v_mobility:=coalesce((v_a.stat_deltas->>'mobility')::integer,0); v_core:=coalesce((v_a.stat_deltas->>'core_power')::integer,0); v_grip:=coalesce((v_a.stat_deltas->>'grip_climbing')::integer,0);
  select coalesce(sum(coalesce((d.mechanics->>'training_xp_pct')::numeric,0) + case when v_a.path_key like 'witcher%' then coalesce((d.mechanics->>'witcher_trial_xp_pct')::numeric,0) else 0 end),0)
  into v_pct from public.player_items pi join public.item_definitions d on d.key=pi.item_key where pi.guild_id=v_a.guild_id and pi.owner_user_id=v_uid and pi.state='equipped';
  v_xp:=round(v_a.xp_personal*(1+v_pct/100.0))::integer; v_bonus:=v_xp-v_a.xp_personal;
  update public.training_assignments set completed_at=now() where id=v_a.id;
  insert into public.training_stats(guild_id,user_id) values(v_a.guild_id,v_uid) on conflict(guild_id,user_id) do nothing;
  update public.training_stats set training_sessions=training_sessions+1,strength=strength+v_strength,endurance=endurance+v_endurance,agility=agility+v_agility,mobility=mobility+v_mobility,core_power=core_power+v_core,grip_climbing=grip_climbing+v_grip,updated_at=now() where guild_id=v_a.guild_id and user_id=v_uid;
  insert into public.player_progress_public(guild_id,user_id,personal_xp) values(v_a.guild_id,v_uid,0) on conflict(guild_id,user_id) do nothing;
  update public.player_progress_public set personal_xp=personal_xp+v_xp,updated_at=now() where guild_id=v_a.guild_id and user_id=v_uid returning personal_xp into v_total;
  v_level:=public.qb_level_for_xp(v_total); update public.player_progress_public set level=v_level,rank_key=public.qb_rank_for_level(v_level) where guild_id=v_a.guild_id and user_id=v_uid;
  select id into v_campaign from public.campaigns where guild_id=v_a.guild_id and status='active' order by started_at desc limit 1;
  if v_campaign is not null and v_a.xp_campaign>0 then
    update public.campaigns set campaign_xp=least(goal_xp,campaign_xp+v_a.xp_campaign),status=case when campaign_xp+v_a.xp_campaign>=goal_xp then 'victory' else status end,completed_at=case when campaign_xp+v_a.xp_campaign>=goal_xp then coalesce(completed_at,now()) else completed_at end,chapter_key=case when campaign_xp+v_a.xp_campaign>=goal_xp then 'burden-ends' when (campaign_xp+v_a.xp_campaign)*100.0/nullif(goal_xp,0)>=80 then 'burning-mountain' when (campaign_xp+v_a.xp_campaign)*100.0/nullif(goal_xp,0)>=60 then 'beneath-mountain' when (campaign_xp+v_a.xp_campaign)*100.0/nullif(goal_xp,0)>=40 then 'crossroads' when (campaign_xp+v_a.xp_campaign)*100.0/nullif(goal_xp,0)>=20 then 'prancing-lantern' else 'road-from-home' end where id=v_campaign;
    insert into public.campaign_contributions(campaign_id,user_id,campaign_xp) values(v_campaign,v_uid,v_a.xp_campaign) on conflict(campaign_id,user_id) do update set campaign_xp=public.campaign_contributions.campaign_xp+excluded.campaign_xp;
  end if;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,campaign_xp,metadata)
  values(v_a.guild_id,v_uid,v_uid,'training_complete','Completed training: '||v_a.title,'guild',v_xp,v_a.xp_campaign,jsonb_build_object('training_assignment_id',v_a.id,'path_key',v_a.path_key,'stat_deltas',v_a.stat_deltas,'gear_bonus',v_bonus));
  return jsonb_build_object('assignment_id',v_a.id,'personal_xp',v_xp,'base_personal_xp',v_a.xp_personal,'gear_bonus',v_bonus,'campaign_xp',v_a.xp_campaign,'stat_deltas',v_a.stat_deltas);
end $function$;
CREATE OR REPLACE FUNCTION public.complete_expedition(p_expedition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=auth.uid(); v_guild uuid; v_e public.expeditions%rowtype; v_total integer; v_level integer; v_campaign uuid; v_cells jsonb; v_cell integer; v_renown integer; v_rank text;
  v_pct numeric:=0; v_xp integer; v_xp_bonus integer:=0; v_extra_renown integer:=0; v_completed_count integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select guild_id into v_guild from public.guild_members where user_id=v_uid limit 1;
  select * into v_e from public.expeditions where id=p_expedition_id and guild_id=v_guild and status='active' for update;
  if not found then raise exception 'Expedition unavailable'; end if;
  select coalesce(sum(coalesce((d.mechanics->>'exploration_xp_pct')::numeric,0)),0),coalesce(sum(coalesce((d.mechanics->>'third_expedition_renown')::integer,0)),0)
    into v_pct,v_extra_renown from public.player_items pi join public.item_definitions d on d.key=pi.item_key where pi.guild_id=v_guild and pi.owner_user_id=v_uid and pi.state='equipped';
  select count(*) into v_completed_count from public.expeditions where guild_id=v_guild and drawn_by=v_uid and status='complete';
  if ((v_completed_count+1)%3)<>0 then v_extra_renown:=0; end if;
  v_xp:=round(v_e.xp_personal*(1+v_pct/100.0))::integer; v_xp_bonus:=v_xp-v_e.xp_personal;
  update public.expeditions set status='complete',completed_at=now() where id=v_e.id;
  update public.player_progress_public set personal_xp=personal_xp+v_xp,updated_at=now() where guild_id=v_guild and user_id=v_uid returning personal_xp into v_total;
  v_level:=public.qb_level_for_xp(v_total); update public.player_progress_public set level=v_level,rank_key=public.qb_rank_for_level(v_level) where guild_id=v_guild and user_id=v_uid;
  select id into v_campaign from public.campaigns where guild_id=v_guild and status='active' order by started_at desc limit 1;
  if v_campaign is not null then
    update public.campaigns set campaign_xp=least(goal_xp,campaign_xp+v_e.xp_campaign),status=case when campaign_xp+v_e.xp_campaign>=goal_xp then 'victory' else status end,completed_at=case when campaign_xp+v_e.xp_campaign>=goal_xp then coalesce(completed_at,now()) else completed_at end,chapter_key=case when campaign_xp+v_e.xp_campaign>=goal_xp then 'burden-ends' when (campaign_xp+v_e.xp_campaign)*100.0/nullif(goal_xp,0)>=80 then 'burning-mountain' when (campaign_xp+v_e.xp_campaign)*100.0/nullif(goal_xp,0)>=60 then 'beneath-mountain' when (campaign_xp+v_e.xp_campaign)*100.0/nullif(goal_xp,0)>=40 then 'crossroads' when (campaign_xp+v_e.xp_campaign)*100.0/nullif(goal_xp,0)>=20 then 'prancing-lantern' else 'road-from-home' end where id=v_campaign;
    insert into public.campaign_contributions(campaign_id,user_id,campaign_xp) values(v_campaign,v_uid,v_e.xp_campaign) on conflict(campaign_id,user_id) do update set campaign_xp=public.campaign_contributions.campaign_xp+excluded.campaign_xp;
  end if;
  insert into public.exploration_state(guild_id,renown,exploration_rank,revealed_cells) values(v_guild,0,'Home Territory','[]'::jsonb) on conflict(guild_id) do nothing;
  select revealed_cells,renown into v_cells,v_renown from public.exploration_state where guild_id=v_guild for update;
  v_renown:=coalesce(v_renown,0)+v_e.renown_reward+v_extra_renown;
  select n into v_cell from generate_series(0,24) n where n<>12 and not (coalesce(v_cells,'[]'::jsonb) @> to_jsonb(array[n])) order by random() limit 1;
  if v_cell is not null then v_cells:=coalesce(v_cells,'[]'::jsonb)||to_jsonb(v_cell); end if;
  v_rank:=case when v_renown<5 then 'Home Territory' when v_renown<12 then 'Beyond the Keep' when v_renown<25 then 'Greater Wilds' else 'Open Road' end;
  update public.exploration_state set renown=v_renown,exploration_rank=v_rank,revealed_cells=v_cells,updated_at=now() where guild_id=v_guild;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,campaign_xp,metadata)
  values(v_guild,v_uid,v_uid,'expedition','Completed expedition: '||v_e.title,'guild',v_xp,v_e.xp_campaign,jsonb_build_object('renown',v_e.renown_reward+v_extra_renown,'base_renown',v_e.renown_reward,'gear_renown_bonus',v_extra_renown,'revealed_cell',v_cell,'gear_xp_bonus',v_xp_bonus));
  return jsonb_build_object('personal_xp',v_xp,'base_personal_xp',v_e.xp_personal,'gear_xp_bonus',v_xp_bonus,'campaign_xp',v_e.xp_campaign,'renown',v_e.renown_reward+v_extra_renown,'gear_renown_bonus',v_extra_renown,'revealed_cell',v_cell,'exploration_rank',v_rank);
end $function$;
