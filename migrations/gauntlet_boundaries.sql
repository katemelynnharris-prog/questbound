alter table public.gauntlet_challenges add column occurrence_key text;
CREATE OR REPLACE FUNCTION game_private.gauntlet_eligible_now(p_q quest_templates, p_target uuid, p_today date, p_except uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare member_key text; cycle jsonb;
begin
 if not p_q.active or not p_q.gauntlet_eligible or p_q.visibility<>'guild' or p_q.hidden_encounter then return false;end if;
 select player_key into member_key from public.guild_members where guild_id=p_q.guild_id and user_id=p_target;
 if not found then return false;end if;
 if p_q.owner_type='individual' and not coalesce((p_q.assigned_user_id=p_target or (p_q.assigned_user_id is null and lower(coalesce(p_q.assignee_key,''))=lower(member_key))),false) then return false;end if;
 if p_q.owner_type not in ('shared','co-op','individual','personal_daily') then return false;end if;
 cycle:=game_private.quest_cycle(p_q,p_target,p_today);
 if not (cycle->>'available')::boolean then return false;end if;
 if p_q.recurrence->>'type'='weekly' and jsonb_array_length(coalesce(p_q.recurrence->'days','[]'::jsonb))>0
   and not (p_q.recurrence->'days' ? to_char(p_today,'Dy')) then return false;end if;
 if p_q.key='no-overspending-week' and not (public.budget_week_state()->>'claimable')::boolean then return false;end if;
 return not exists(select 1 from public.gauntlet_challenges c where c.quest_id=p_q.id and c.status='active' and c.id is distinct from p_except
   and c.occurrence_key=cycle->>'occurrence_key'
   and (p_q.owner_type in ('shared','co-op') or c.target_user_id=p_target));
end $function$
;
revoke all on function game_private.gauntlet_eligible_now(public.quest_templates,uuid,date,uuid) from public,anon,authenticated;
update public.gauntlet_challenges c set occurrence_key=game_private.quest_cycle(q,c.target_user_id,public.qb_effective_date(c.guild_id))->>'occurrence_key'
from public.quest_templates q where q.id=c.quest_id and c.status='active';
update public.quest_templates set gauntlet_eligible=true,updated_at=now()
where guild_id in(select id from public.guilds where slug='questbound-harris') and active;
CREATE OR REPLACE FUNCTION public.admin_force_gauntlet(p_target_player_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_gid uuid; v_target uuid; v_target_key text; v_q public.quest_templates%rowtype; v_id uuid;
begin
  select guild_id into v_gid from public.guild_members where user_id=v_uid and role='admin' limit 1;
  if v_gid is null then raise exception 'Guild admin required'; end if;
  select user_id,player_key into v_target,v_target_key from public.guild_members where guild_id=v_gid and lower(player_key)=lower(p_target_player_key) limit 1;
  if v_target is null then raise exception 'That player has not joined yet'; end if;
  select q.* into v_q from public.quest_templates q
  where q.guild_id=v_gid and q.active=true and q.gauntlet_eligible=true and q.visibility='guild'
    and game_private.gauntlet_eligible_now(q,v_target,public.qb_effective_date(v_gid),null)
    and (q.owner_type in ('shared','co-op','personal_daily') or (q.owner_type='individual' and (q.assigned_user_id=v_target or (q.assigned_user_id is null and lower(coalesce(q.assignee_key,''))=lower(v_target_key)))))
  order by random() limit 1;
  if not found then raise exception 'No eligible Gauntlet quest is available for that player'; end if;
  insert into public.gauntlet_challenges(guild_id,source_user_id,target_user_id,quest_id,objective,reward_personal_xp,status,reroll_used,occurrence_key)
  values(v_gid,v_uid,v_target,v_q.id,coalesce(nullif(v_q.objective,''),v_q.title),75,'active',false,game_private.quest_cycle(v_q,v_target,public.qb_effective_date(v_gid))->>'occurrence_key') returning id into v_id;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
  values(v_gid,v_uid,v_target,'admin_test','Forced playtest Gauntlet for '||v_target_key,'private',jsonb_build_object('challenge_id',v_id,'quest_id',v_q.id));
  return jsonb_build_object('challenge_id',v_id,'target_user_id',v_target,'objective',coalesce(nullif(v_q.objective,''),v_q.title));
end $function$
;
CREATE OR REPLACE FUNCTION public.reroll_gauntlet_challenge(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_c public.gauntlet_challenges%rowtype; v_target_key text; v_q public.quest_templates%rowtype; v_old text;
begin
  select * into v_c from public.gauntlet_challenges where id=p_challenge_id and target_user_id=v_uid and status='active' for update;
  if not found then raise exception 'Active Gauntlet not available to you'; end if;
  if v_c.reroll_used then raise exception 'This Gauntlet has already been rerolled once'; end if;
  select player_key into v_target_key from public.guild_members where guild_id=v_c.guild_id and user_id=v_uid;
  select q.* into v_q from public.quest_templates q
  where q.guild_id=v_c.guild_id and q.active=true and q.gauntlet_eligible=true and q.visibility='guild' and q.id<>v_c.quest_id
    and game_private.gauntlet_eligible_now(q,v_uid,public.qb_effective_date(v_c.guild_id),v_c.id)
    and (q.owner_type in ('shared','co-op','personal_daily') or (q.owner_type='individual' and (q.assigned_user_id=v_uid or (q.assigned_user_id is null and lower(coalesce(q.assignee_key,''))=lower(v_target_key)))))
  order by random() limit 1;
  if not found then raise exception 'No other eligible Gauntlet quest is available'; end if;
  v_old:=v_c.objective;
  update public.gauntlet_challenges set quest_id=v_q.id,occurrence_key=game_private.quest_cycle(v_q,v_uid,public.qb_effective_date(v_c.guild_id))->>'occurrence_key',created_at=now(),objective=coalesce(nullif(v_q.objective,''),v_q.title),reroll_used=true where id=v_c.id;
  insert into public.activity_events(guild_id,actor_user_id,event_type,message,visibility,metadata)
  values(v_c.guild_id,v_uid,'gauntlet_reroll','Rerolled a Gauntlet challenge','guild',jsonb_build_object('challenge_id',v_c.id,'old_objective',v_old,'new_objective',coalesce(nullif(v_q.objective,''),v_q.title)));
  return jsonb_build_object('challenge_id',v_c.id,'objective',coalesce(nullif(v_q.objective,''),v_q.title),'reroll_used',true);
end $function$
;
CREATE OR REPLACE FUNCTION public.use_player_item(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_item public.player_items%rowtype; v_def public.item_definitions%rowtype; v_target uuid; v_target_key text; v_q public.quest_templates%rowtype; v_ch uuid; v_gi uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_item from public.player_items where id=p_item_id and owner_user_id=v_uid and state='pack' for update;
  if not found then raise exception 'Item must be in your Pack before it can be used'; end if;
  select * into v_def from public.item_definitions where key=v_item.item_key and active=true;
  if not found then raise exception 'Item definition unavailable'; end if;

  if v_def.kind='challenge' or coalesce((v_def.mechanics->>'gauntlet')::boolean,false) then
    select gm.user_id,gm.player_key into v_target,v_target_key from public.guild_members gm where gm.guild_id=v_item.guild_id and gm.user_id<>v_uid order by gm.joined_at limit 1;
    if v_target is null then raise exception 'Your spouse has not joined Questbound yet'; end if;
    select q.* into v_q
    from public.quest_templates q
    where q.guild_id=v_item.guild_id and q.active=true and q.gauntlet_eligible=true and q.visibility='guild'
      and game_private.gauntlet_eligible_now(q,v_target,public.qb_effective_date(v_item.guild_id),null)
      and (q.owner_type in ('shared','co-op','personal_daily') or (q.owner_type='individual' and (q.assigned_user_id=v_target or (q.assigned_user_id is null and lower(coalesce(q.assignee_key,''))=lower(v_target_key)))))
    order by random() limit 1;
    if not found then raise exception 'No eligible Gauntlet quests are available'; end if;
    insert into public.gauntlet_challenges(guild_id,source_user_id,target_user_id,quest_id,objective,reward_personal_xp,status,reroll_used,occurrence_key)
    values(v_item.guild_id,v_uid,v_target,v_q.id,coalesce(nullif(v_q.objective,''),v_q.title),75,'active',false,game_private.quest_cycle(v_q,v_target,public.qb_effective_date(v_item.guild_id))->>'occurrence_key') returning id into v_ch;
    update public.player_items set state='consumed',equipped_slot=null where id=v_item.id;
    insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
    values(v_item.guild_id,v_uid,v_target,'gauntlet','Threw a Gauntlet: '||coalesce(nullif(v_q.objective,''),v_q.title),'guild',jsonb_build_object('challenge_id',v_ch,'quest_id',v_q.id,'reward_personal_xp',75));
    return jsonb_build_object('kind','gauntlet','challenge_id',v_ch,'objective',coalesce(nullif(v_q.objective,''),v_q.title),'target_user_id',v_target);
  elsif v_item.item_key='safe-passage' or coalesce((v_def.mechanics->>'treasury_mitigation')::boolean,false) then
    insert into public.guild_items(guild_id,item_key,quantity,metadata)
    values(v_item.guild_id,v_item.item_key,1,jsonb_build_object('name',v_def.name,'description','The next Treasury withdrawal penalty is prevented.','effect',jsonb_build_object('kind','safe_passage','uses',1))) returning id into v_gi;
    update public.player_items set state='consumed',equipped_slot=null where id=v_item.id;
    insert into public.activity_events(guild_id,actor_user_id,event_type,message,visibility,metadata)
    values(v_item.guild_id,v_uid,'item_use','Activated '||v_def.name,'guild',jsonb_build_object('guild_item_id',v_gi,'item_key',v_def.key));
    return jsonb_build_object('kind','guild_effect','guild_item_id',v_gi,'name',v_def.name);
  elsif v_def.kind='gear' then
    raise exception 'Equip gear instead of using it';
  else
    update public.player_items set state='consumed',equipped_slot=null where id=v_item.id;
    insert into public.activity_events(guild_id,actor_user_id,event_type,message,visibility,metadata)
    values(v_item.guild_id,v_uid,'item_use','Used '||v_def.name,'guild',jsonb_build_object('item_key',v_def.key));
    return jsonb_build_object('kind','consumed','name',v_def.name);
  end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.complete_gauntlet_challenge(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_c public.gauntlet_challenges%rowtype; v_bonus integer:=0; v_reward integer; v_total integer; v_level integer; v_q public.quest_templates%rowtype; v_cycle jsonb; v_quest_reward jsonb; v_existing_completion uuid; v_today date;
begin
  select * into v_c from public.gauntlet_challenges where id=p_challenge_id and target_user_id=v_uid and status='active' for update;
  if not found then raise exception 'Active Gauntlet not available to you'; end if;
  if v_uid is null or not public.is_guild_member(v_c.guild_id) then raise exception 'Guild membership required';end if;
  select * into v_q from public.quest_templates where id=v_c.quest_id for update;
  if not found then raise exception 'Quest unavailable';end if;
  v_today:=public.qb_effective_date(v_c.guild_id);
  v_cycle:=game_private.quest_cycle(v_q,v_uid,v_today);
  -- A normal Journal completion after the challenge was assigned can also satisfy it.
  select id into v_existing_completion from public.quest_completions c
  where c.quest_id=v_q.id and c.occurrence_key=v_c.occurrence_key and c.completed_by=v_uid
    and c.reversed_at is null and c.completed_at>=v_c.created_at limit 1;
  if v_existing_completion is null then
    if v_c.occurrence_key is distinct from v_cycle->>'occurrence_key'
      or not game_private.gauntlet_eligible_now(v_q,v_uid,v_today,v_c.id) then
      update public.gauntlet_challenges set status='expired' where id=v_c.id;
      return jsonb_build_object('challenge_id',v_c.id,'expired',true,'message','This quest occurrence is no longer available. No reward was claimed.');
    end if;
    v_quest_reward:=public.complete_quest(v_q.id,v_c.occurrence_key,'gauntlet');
    v_existing_completion:=(v_quest_reward->>'completion_id')::uuid;
  end if;
  select coalesce(round(v_c.reward_personal_xp*sum(coalesce((d.mechanics->>'gauntlet_xp_pct')::numeric,0))/100.0)::integer,0) into v_bonus
  from public.player_items pi join public.item_definitions d on d.key=pi.item_key
  where pi.guild_id=v_c.guild_id and pi.owner_user_id=v_uid and pi.state='equipped';
  v_reward:=v_c.reward_personal_xp+coalesce(v_bonus,0);
  update public.gauntlet_challenges set status='complete',completed_at=now() where id=v_c.id;
  insert into public.player_progress_public(guild_id,user_id,personal_xp) values(v_c.guild_id,v_uid,0) on conflict(guild_id,user_id) do nothing;
  update public.player_progress_public set personal_xp=personal_xp+v_reward,updated_at=now() where guild_id=v_c.guild_id and user_id=v_uid returning personal_xp into v_total;
  v_level:=public.qb_level_for_xp(v_total);
  update public.player_progress_public set level=v_level,rank_key=public.qb_rank_for_level(v_level) where guild_id=v_c.guild_id and user_id=v_uid;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,metadata)
  values(v_c.guild_id,v_uid,v_uid,'gauntlet_complete','Completed Gauntlet: '||v_c.objective,'guild',v_reward,jsonb_build_object('challenge_id',v_c.id,'base_reward',v_c.reward_personal_xp,'gear_bonus',v_bonus,'quest_completion_id',v_existing_completion));
  return jsonb_build_object('challenge_id',v_c.id,'personal_xp',v_reward,'gear_bonus',v_bonus,'quest_reward',v_quest_reward,'quest_completion_id',v_existing_completion);
end $function$
;