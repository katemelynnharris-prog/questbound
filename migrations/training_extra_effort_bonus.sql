
-- Preserve current Ledger placements; future quests require an explicit opt-in.
update public.quest_templates set recurrence=recurrence||'{"daily_ledger":true}'::jsonb
where active and not (recurrence ? 'daily_ledger')
and (owner_type='personal_daily' or (owner_type='co-op' and recurrence->>'type'='daily') or key='walk-arthur');

alter table public.training_assignments
 add column if not exists bonus_claimed_at timestamptz,
 add column if not exists bonus_reason text,
 add column if not exists bonus_personal_xp integer not null default 0 check (bonus_personal_xp between 0 and 50),
 add column if not exists bonus_campaign_xp integer not null default 0 check (bonus_campaign_xp between 0 and 10),
 add column if not exists bonus_campaign_id uuid references public.campaigns(id);
-- Training completion, rerolls, undo and bonus awards use checked RPCs.
revoke insert,update,delete,truncate,references,trigger on public.training_assignments from authenticated,anon;

create or replace function public.claim_training_bonus(p_assignment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 uid uuid:=auth.uid(); a public.training_assignments; total integer; lvl integer;
 campaign public.campaigns; cxp integer:=0; new_cxp integer; pct numeric;
begin
 if uid is null then raise exception 'Authentication required';end if;
 if p_reason is null or p_reason not in ('more','harder','both') then raise exception 'Choose more, harder, or both';end if;
 select * into a from public.training_assignments where id=p_assignment_id and user_id=uid for update;
 if not found or not public.is_guild_member(a.guild_id) then raise exception 'Training assignment unavailable';end if;
 if a.assignment_date<>public.qb_effective_date(a.guild_id) then raise exception 'Bonus is available for today''s workout only';end if;
 if a.completed_at is null then raise exception 'Complete the assigned workout first';end if;
 if a.bonus_claimed_at is not null then raise exception 'Workout bonus already claimed';end if;
 insert into public.player_progress_public(guild_id,user_id,personal_xp) values(a.guild_id,uid,0) on conflict(guild_id,user_id) do nothing;
 update public.player_progress_public set personal_xp=personal_xp+50,updated_at=now()
 where guild_id=a.guild_id and user_id=uid returning personal_xp into total;
 lvl:=public.qb_level_for_xp(total);
 update public.player_progress_public set level=lvl,rank_key=public.qb_rank_for_level(lvl) where guild_id=a.guild_id and user_id=uid;
 select * into campaign from public.campaigns where guild_id=a.guild_id and status='active' order by started_at desc limit 1 for update;
 if found then
  cxp:=least(10,greatest(0,campaign.goal_xp-campaign.campaign_xp));new_cxp:=campaign.campaign_xp+cxp;
  pct:=new_cxp*100.0/nullif(campaign.goal_xp,0);
  update public.campaigns set campaign_xp=new_cxp,status=case when new_cxp>=goal_xp then 'victory' else status end,
   completed_at=case when new_cxp>=goal_xp then coalesce(completed_at,now()) else completed_at end,
   chapter_key=case when pct>=100 then 'burden-ends' when pct>=80 then 'burning-mountain' when pct>=60 then 'beneath-mountain' when pct>=40 then 'crossroads' when pct>=20 then 'prancing-lantern' else 'road-from-home' end
   where id=campaign.id;
  insert into public.campaign_contributions(campaign_id,user_id,campaign_xp) values(campaign.id,uid,cxp)
   on conflict(campaign_id,user_id) do update set campaign_xp=public.campaign_contributions.campaign_xp+excluded.campaign_xp;
 end if;
 update public.training_assignments set bonus_claimed_at=now(),bonus_reason=p_reason,bonus_personal_xp=50,
  bonus_campaign_xp=cxp,bonus_campaign_id=campaign.id where id=a.id;
 insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,campaign_xp,metadata)
 values(a.guild_id,uid,uid,'training_bonus','Went beyond the assigned workout: '||a.title,'guild',50,cxp,
  jsonb_build_object('training_assignment_id',a.id,'reason',p_reason,'campaign_id',campaign.id));
 return jsonb_build_object('personal_xp',50,'campaign_xp',cxp,'claimed',true);
end $function$;
revoke all on function public.claim_training_bonus(uuid,text) from public,anon;
grant execute on function public.claim_training_bonus(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.undo_training_assignment(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid();v_a public.training_assignments%rowtype;v_evt public.activity_events%rowtype;v_campaign uuid;v_newxp integer;v_newlevel integer;v_strength integer;v_endurance integer;v_agility integer;v_mobility integer;v_core integer;v_grip integer;
begin
  if v_uid is null then raise exception 'Authentication required';end if;
  select * into v_a from public.training_assignments where id=p_assignment_id and user_id=v_uid for update;if not found then raise exception 'Training assignment unavailable';end if;if v_a.completed_at is null then raise exception 'Training assignment is not completed';end if;
  select * into v_evt from public.activity_events where guild_id=v_a.guild_id and actor_user_id=v_uid and event_type='training_complete' and metadata->>'training_assignment_id'=v_a.id::text order by created_at desc limit 1;
  v_strength:=coalesce((v_a.stat_deltas->>'strength')::integer,0);v_endurance:=coalesce((v_a.stat_deltas->>'endurance')::integer,0);v_agility:=coalesce((v_a.stat_deltas->>'agility')::integer,0);v_mobility:=coalesce((v_a.stat_deltas->>'mobility')::integer,0);v_core:=coalesce((v_a.stat_deltas->>'core_power')::integer,0);v_grip:=coalesce((v_a.stat_deltas->>'grip_climbing')::integer,0);
  update public.training_stats set training_sessions=greatest(0,training_sessions-1),strength=greatest(0,strength-v_strength),endurance=greatest(0,endurance-v_endurance),agility=greatest(0,agility-v_agility),mobility=greatest(0,mobility-v_mobility),core_power=greatest(0,core_power-v_core),grip_climbing=greatest(0,grip_climbing-v_grip),updated_at=now() where guild_id=v_a.guild_id and user_id=v_uid;
  update public.player_progress_public set personal_xp=greatest(0,personal_xp-coalesce(v_evt.personal_xp,v_a.xp_personal)-v_a.bonus_personal_xp),updated_at=now() where guild_id=v_a.guild_id and user_id=v_uid returning personal_xp into v_newxp;
  v_newlevel:=public.qb_level_for_xp(v_newxp);update public.player_progress_public set level=v_newlevel,rank_key=public.qb_rank_for_level(v_newlevel) where guild_id=v_a.guild_id and user_id=v_uid;
  select id into v_campaign from public.campaigns where guild_id=v_a.guild_id and status in ('active','victory') order by started_at desc limit 1;
  if v_campaign is not null and coalesce(v_evt.campaign_xp,v_a.xp_campaign)>0 then update public.campaigns set campaign_xp=greatest(0,campaign_xp-coalesce(v_evt.campaign_xp,v_a.xp_campaign)),status='active',completed_at=null where id=v_campaign;update public.campaign_contributions set campaign_xp=greatest(0,campaign_xp-coalesce(v_evt.campaign_xp,v_a.xp_campaign)) where campaign_id=v_campaign and user_id=v_uid;end if;
  if v_a.bonus_campaign_id is not null and v_a.bonus_campaign_xp>0 then
    update public.campaigns set campaign_xp=greatest(0,campaign_xp-v_a.bonus_campaign_xp),
      status=case when status='victory' and greatest(0,campaign_xp-v_a.bonus_campaign_xp)<goal_xp then 'active' else status end,
      completed_at=case when status='victory' and greatest(0,campaign_xp-v_a.bonus_campaign_xp)<goal_xp then null else completed_at end
      where id=v_a.bonus_campaign_id;
    update public.campaign_contributions set campaign_xp=greatest(0,campaign_xp-v_a.bonus_campaign_xp) where campaign_id=v_a.bonus_campaign_id and user_id=v_uid;
  end if;
  update public.training_assignments set completed_at=null,bonus_claimed_at=null,bonus_reason=null,bonus_personal_xp=0,bonus_campaign_xp=0,bonus_campaign_id=null where id=v_a.id;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,campaign_xp,metadata) values(v_a.guild_id,v_uid,v_uid,'training_undo','Undid training: '||v_a.title,'guild',-(coalesce(v_evt.personal_xp,v_a.xp_personal)+v_a.bonus_personal_xp),-(coalesce(v_evt.campaign_xp,v_a.xp_campaign)+v_a.bonus_campaign_xp),jsonb_build_object('training_assignment_id',v_a.id));
  return jsonb_build_object('assignment_id',v_a.id,'undone',true);
end $function$;
