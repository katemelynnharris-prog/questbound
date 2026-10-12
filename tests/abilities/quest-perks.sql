create function game_private.apply_quest_perks(p_completion uuid)
returns jsonb language plpgsql set search_path='' as $f$
declare c public.quest_completions;q public.quest_templates;r public.quest_completion_rewards;s jsonb;lvl int;xp int;base int;cb int;target int;step int;
 bonus int;actor_bonus int:=0;effects jsonb;details jsonb:='[]';rank int;week date;camp public.campaigns;campaign_bonus int:=0;actor_campaign int:=0;rewards jsonb;chosen boolean;
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
  bonus:=0;effects:='[]';campaign_bonus:=0;
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
  update public.quest_completion_rewards set personal_xp_awarded=personal_xp_awarded+bonus,metadata=metadata||jsonb_build_object('quest_perks_applied',true,'ability_effects',effects,'ability_bonus',bonus) where completion_id=c.id and user_id=r.user_id;
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
end $f$;
revoke all on function game_private.apply_quest_perks(uuid) from public,anon,authenticated;
create function public.complete_quest_abilities(p_quest_id uuid,p_occurrence_key text,p_source text default 'journal')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare result jsonb;bonus jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 result:=public.complete_quest_rested(p_quest_id,p_occurrence_key,p_source);bonus:=game_private.apply_quest_perks((result->>'completion_id')::uuid);
 return result||jsonb_build_object('ability_rewards',bonus->'ability_rewards','rewards',bonus->'rewards','personal_xp_each',(result->>'personal_xp_each')::int+(bonus->>'actor_bonus')::int,'campaign_xp',(result->>'campaign_xp')::int+(bonus->>'campaign_bonus')::int);
end $f$;
revoke all on function public.complete_quest_abilities(uuid,text,text) from public,anon;grant execute on function public.complete_quest_abilities(uuid,text,text) to authenticated;

