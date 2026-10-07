CREATE OR REPLACE FUNCTION public.complete_quest(p_quest_id uuid, p_occurrence_key text, p_source text DEFAULT 'journal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=auth.uid(); v_q public.quest_templates%rowtype; v_completion uuid; v_subject uuid;
  v_xp integer; v_base_xp integer; v_base_campaign integer; v_campaign uuid; v_campaign_xp integer:=0; v_campaign_bonus integer:=0; v_cache_bonus integer:=0;
  v_visibility text; v_reward_user uuid; v_rewards jsonb:='[]'::jsonb; v_loot_rewards jsonb:='[]'::jsonb; v_loot jsonb; v_total_xp integer; v_new_level integer;
  v_tz text; v_today date; v_fate_key text; v_fate_note text:=null; v_has_prior boolean:=false; v_player_key text;
  v_defense integer:=0; v_ward numeric:=0; v_penalty_pct numeric:=0; v_ward_blocked boolean:=false;
  v_cache public.guild_items%rowtype; v_cache_uses integer:=0;
  v_count_target integer:=1; v_existing_count integer:=0; v_step integer:=1; v_occurrence_key text; v_cycle jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_occurrence_key is null or btrim(p_occurrence_key)='' then raise exception 'occurrence_key required'; end if;
  if p_source not in ('journal','featured','gauntlet','calendar','admin','system') then raise exception 'Invalid source'; end if;
  select * into v_q from public.quest_templates where id=p_quest_id and active=true for update;
  if not found or not public.can_view_quest(p_quest_id) then raise exception 'Quest unavailable'; end if;
  select timezone into v_tz from public.guilds where id=v_q.guild_id;
  v_today:=public.qb_effective_date(v_q.guild_id);
  perform public.ensure_home_cycles();
  select fate_key into v_fate_key from public.fate_days where guild_id=v_q.guild_id and fate_date=v_today;

  if v_q.owner_type='individual' then
    select player_key into v_player_key from public.guild_members where guild_id=v_q.guild_id and user_id=v_uid;
    if v_q.assigned_user_id is distinct from v_uid and not (v_q.assigned_user_id is null and lower(coalesce(v_q.assignee_key,''))=lower(coalesce(v_player_key,''))) then raise exception 'Quest assigned to another player'; end if;
    if v_q.assigned_user_id is null then update public.quest_templates set assigned_user_id=v_uid,updated_at=now() where id=v_q.id; end if;
    v_subject:=v_uid;
  elsif v_q.owner_type='personal_daily' then v_subject:=v_uid;
  else v_subject:=null; end if;

  begin v_count_target:=greatest(1,coalesce((v_q.recurrence->>'count_target')::integer,1)); exception when others then v_count_target:=1; end;
  v_cycle:=game_private.quest_cycle(v_q,v_uid,v_today);
  if not (v_cycle->>'active')::boolean then raise exception 'Quest is outside its active season'; end if;
  if (v_cycle->>'complete')::boolean then raise exception 'Quest is not yet available again'; end if;
  v_occurrence_key:=v_cycle->>'occurrence_key';
  if coalesce(v_q.recurrence->>'type','once')='daily' and v_count_target>1 then
    v_existing_count:=(v_cycle->>'count')::integer;
    if v_existing_count>=v_count_target then raise exception 'Daily target already complete'; end if;
    v_step:=v_existing_count+1;
    v_occurrence_key:=v_today::text||':step:'||v_step::text;
    v_base_xp:=floor(v_q.xp_personal::numeric/v_count_target)::integer;
    v_base_campaign:=floor(v_q.xp_campaign::numeric/v_count_target)::integer;
    if v_step=v_count_target then
      v_base_xp:=v_q.xp_personal-(v_base_xp*(v_count_target-1));
      v_base_campaign:=v_q.xp_campaign-(v_base_campaign*(v_count_target-1));
    end if;
  else
    v_base_xp:=v_q.xp_personal;
    v_base_campaign:=v_q.xp_campaign;
  end if;

  v_xp:=case when p_source='featured' then round(v_base_xp*1.20)::integer else v_base_xp end;
  if v_fate_key='bold' and p_source='featured' then
    select exists(select 1 from public.quest_completions qc where qc.guild_id=v_q.guild_id and qc.completed_by=v_uid and qc.source='featured' and qc.reversed_at is null and qc.effective_date=v_today) into v_has_prior;
    if not v_has_prior then v_xp:=round(v_base_xp*1.50)::integer;v_fate_note:='Fortune Favors the Bold';end if;
  elsif v_fate_key='mischief' and p_source='featured' then v_xp:=round(v_base_xp*1.30)::integer;v_fate_note:='Mischief';
  elsif v_fate_key='company' and v_q.owner_type='co-op' then v_xp:=round(v_xp*1.50)::integer;v_fate_note:='Company of Two';
  elsif v_fate_key='fortune' then v_xp:=v_xp+15;v_fate_note:='Fortune Smiles';
  elsif v_fate_key='homefront' and lower(v_q.category) in ('home','tasks','homestead','garage') then v_xp:=round(v_xp*1.35)::integer;v_fate_note:='Homefront';
  elsif v_fate_key='longroad' then
    select exists(select 1 from public.quest_completions qc where qc.guild_id=v_q.guild_id and qc.completed_by=v_uid and qc.reversed_at is null and qc.effective_date=v_today) into v_has_prior;
    if not v_has_prior then v_campaign_bonus:=25;v_fate_note:='Long Road';end if;
  elsif v_fate_key='roughroads' then
    select coalesce(defense,0),coalesce(ward,0) into v_defense,v_ward from public.player_progress_public where guild_id=v_q.guild_id and user_id=v_uid;
    if random()*100<least(75,greatest(0,v_ward)) then v_ward_blocked:=true;v_fate_note:='Rough Roads · Ward held';
    else v_penalty_pct:=greatest(0.05,0.25-least(0.20,greatest(0,v_defense)*0.01));v_xp:=greatest(1,round(v_xp*(1-v_penalty_pct))::integer);v_fate_note:='Rough Roads · Defense softened the loss';end if;
  end if;
  v_campaign_xp:=v_base_campaign+v_campaign_bonus;

  select id into v_campaign from public.campaigns where guild_id=v_q.guild_id and status='active' order by started_at desc limit 1;
  if v_campaign is not null and v_campaign_xp>0 then
    select * into v_cache from public.guild_items where guild_id=v_q.guild_id and item_key='campaign-victory-cache' and quantity>0 order by created_at limit 1 for update;
    if found then
      v_cache_uses:=coalesce((v_cache.metadata#>>'{effect,uses}')::integer,3);v_cache_bonus:=greatest(1,round(v_campaign_xp*0.15)::integer);v_campaign_xp:=v_campaign_xp+v_cache_bonus;
      if v_cache_uses>1 then update public.guild_items set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{effect,uses}',to_jsonb(v_cache_uses-1),true) where id=v_cache.id;
      elsif v_cache.quantity>1 then update public.guild_items set quantity=quantity-1,metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{effect,uses}',to_jsonb(3),true) where id=v_cache.id;
      else delete from public.guild_items where id=v_cache.id; end if;
    end if;
  end if;

  insert into public.quest_completions(guild_id,quest_id,completed_by,subject_user_id,occurrence_key,source,campaign_xp_awarded,modifiers,effective_date)
  values(v_q.guild_id,v_q.id,v_uid,v_subject,v_occurrence_key,p_source,v_campaign_xp,
    (case when v_fate_note is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('kind','fate','name',v_fate_note,'ward_blocked',v_ward_blocked,'penalty_pct',v_penalty_pct)) end)
    ||(case when v_cache_bonus>0 then jsonb_build_array(jsonb_build_object('kind','guild_effect','name','Campaign Victory Cache','campaign_xp_bonus',v_cache_bonus)) else '[]'::jsonb end),v_today) returning id into v_completion;

  if v_q.owner_type='co-op' then
    for v_reward_user in select user_id from public.guild_members where guild_id=v_q.guild_id loop
      insert into public.quest_completion_rewards(completion_id,user_id,personal_xp_awarded,metadata) values(v_completion,v_reward_user,v_xp,jsonb_build_object('fate',v_fate_note));
      insert into public.player_progress_public(guild_id,user_id,personal_xp) values(v_q.guild_id,v_reward_user,0) on conflict(guild_id,user_id) do nothing;
      update public.player_progress_public set personal_xp=personal_xp+v_xp,updated_at=now() where guild_id=v_q.guild_id and user_id=v_reward_user returning personal_xp into v_total_xp;
      v_new_level:=public.qb_level_for_xp(v_total_xp);update public.player_progress_public set level=v_new_level,rank_key=public.qb_rank_for_level(v_new_level) where guild_id=v_q.guild_id and user_id=v_reward_user;
      v_rewards:=v_rewards||jsonb_build_array(jsonb_build_object('user_id',v_reward_user,'personal_xp',v_xp));
      v_loot:=public.qb_maybe_award_loot(v_q.guild_id,v_reward_user,v_q.value_tier,v_q.major_achievement,v_completion);if v_loot is not null then v_loot_rewards:=v_loot_rewards||jsonb_build_array(v_loot||jsonb_build_object('user_id',v_reward_user));end if;
    end loop;
  else
    insert into public.quest_completion_rewards(completion_id,user_id,personal_xp_awarded,metadata) values(v_completion,v_uid,v_xp,jsonb_build_object('fate',v_fate_note));
    insert into public.player_progress_public(guild_id,user_id,personal_xp) values(v_q.guild_id,v_uid,0) on conflict(guild_id,user_id) do nothing;
    update public.player_progress_public set personal_xp=personal_xp+v_xp,updated_at=now() where guild_id=v_q.guild_id and user_id=v_uid returning personal_xp into v_total_xp;
    v_new_level:=public.qb_level_for_xp(v_total_xp);update public.player_progress_public set level=v_new_level,rank_key=public.qb_rank_for_level(v_new_level) where guild_id=v_q.guild_id and user_id=v_uid;
    v_rewards:=jsonb_build_array(jsonb_build_object('user_id',v_uid,'personal_xp',v_xp));
    v_loot:=public.qb_maybe_award_loot(v_q.guild_id,v_uid,v_q.value_tier,v_q.major_achievement,v_completion);if v_loot is not null then v_loot_rewards:=jsonb_build_array(v_loot||jsonb_build_object('user_id',v_uid));end if;
  end if;

  if v_campaign is not null and v_campaign_xp>0 then
    update public.campaigns set campaign_xp=least(goal_xp,campaign_xp+v_campaign_xp),status=case when campaign_xp+v_campaign_xp>=goal_xp then 'victory' else status end,completed_at=case when campaign_xp+v_campaign_xp>=goal_xp then coalesce(completed_at,now()) else completed_at end,chapter_key=case when campaign_xp+v_campaign_xp>=goal_xp then 'burden-ends' when (campaign_xp+v_campaign_xp)*100.0/nullif(goal_xp,0)>=80 then 'burning-mountain' when (campaign_xp+v_campaign_xp)*100.0/nullif(goal_xp,0)>=60 then 'beneath-mountain' when (campaign_xp+v_campaign_xp)*100.0/nullif(goal_xp,0)>=40 then 'crossroads' when (campaign_xp+v_campaign_xp)*100.0/nullif(goal_xp,0)>=20 then 'prancing-lantern' else 'road-from-home' end where id=v_campaign;
    insert into public.campaign_contributions(campaign_id,user_id,campaign_xp) values(v_campaign,v_uid,v_campaign_xp) on conflict(campaign_id,user_id) do update set campaign_xp=public.campaign_contributions.campaign_xp+excluded.campaign_xp;
  end if;

  v_visibility:=case when v_q.visibility='guild' then 'guild' else 'private' end;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,campaign_xp,metadata)
  values(v_q.guild_id,v_uid,v_uid,'quest_complete','Completed '||v_q.title,v_visibility,v_xp,v_campaign_xp,jsonb_build_object('quest_id',v_q.id,'completion_id',v_completion,'source',p_source,'rewards',v_rewards,'fate',v_fate_note,'campaign_cache_bonus',v_cache_bonus,'loot',v_loot_rewards,'count_step',v_step,'count_target',v_count_target));
  return jsonb_build_object('completion_id',v_completion,'personal_xp_each',v_xp,'campaign_xp',v_campaign_xp,'rewards',v_rewards,'fate',v_fate_note,'campaign_cache_bonus',v_cache_bonus,'ward_blocked',v_ward_blocked,'loot',v_loot_rewards,'count_current',v_step,'count_target',v_count_target,'count_complete',v_step>=v_count_target);
exception when unique_violation then raise exception 'Quest occurrence already completed';
end;
$function$
