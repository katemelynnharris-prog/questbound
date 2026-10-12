create function game_private.apply_training_perks(p_assignment uuid,p_result jsonb)
returns jsonb language plpgsql set search_path='' as $f$
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
end $f$;
revoke all on function game_private.apply_training_perks(uuid,jsonb) from public,anon,authenticated;
create function public.complete_training_abilities(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare r jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 r:=public.complete_training_assignment(p_assignment_id);return game_private.apply_training_perks(p_assignment_id,r);
end $f$;
revoke all on function public.complete_training_abilities(uuid) from public,anon;grant execute on function public.complete_training_abilities(uuid) to authenticated;

create function public.use_second_wind_abilities(p_kind text,p_target uuid,p_occurrence_key text default null,p_source text default 'journal')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare r jsonb;b jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 r:=public.use_second_wind_rested(p_kind,p_target,p_occurrence_key,p_source);
 if p_kind='training' then return game_private.apply_training_perks(p_target,r);end if;
 b:=game_private.apply_quest_perks((r->>'completion_id')::uuid);
 return r||jsonb_build_object('personal_xp_each',(r->>'personal_xp_each')::int+(b->>'actor_bonus')::int,'campaign_xp',(r->>'campaign_xp')::int+(b->>'campaign_bonus')::int,'ability_rewards',b->'ability_rewards','rewards',b->'rewards');
end $f$;
revoke all on function public.use_second_wind_abilities(text,uuid,text,text) from public,anon;grant execute on function public.use_second_wind_abilities(text,uuid,text,text) to authenticated;

create function public.complete_gauntlet_abilities(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
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
end $f$;
revoke all on function public.complete_gauntlet_abilities(uuid) from public,anon;grant execute on function public.complete_gauntlet_abilities(uuid) to authenticated;

create function public.complete_expedition_abilities(p_expedition_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
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
end $f$;
revoke all on function public.complete_expedition_abilities(uuid) from public,anon;grant execute on function public.complete_expedition_abilities(uuid) to authenticated;

