create table public.rested_banks(
 id uuid primary key default gen_random_uuid(),guild_id uuid not null references public.guilds(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,week_key date not null,
 activity text not null check(length(activity) between 1 and 160),
 logged_at timestamptz not null default now(),consumed_at timestamptz,
 completion_id uuid references public.quest_completions(id) on delete set null,
 unique(guild_id,user_id,week_key));
create unique index rested_one_pending on public.rested_banks(guild_id,user_id) where consumed_at is null;
alter table public.rested_banks enable row level security;
create policy rested_self on public.rested_banks for select to authenticated using(user_id=(select auth.uid()) and public.is_guild_member(guild_id));
revoke all on public.rested_banks from public,anon,authenticated;
grant select on public.rested_banks to authenticated;

create function public.rested_state()
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare gid uuid;d date;w date;lvl int;pending public.rested_banks;logged boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 d:=public.qb_effective_date(gid);w:=d-(extract(isodow from d)::int-1);
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid();
 select * into pending from public.rested_banks where guild_id=gid and user_id=auth.uid() and consumed_at is null;
 select exists(select 1 from public.rested_banks where guild_id=gid and user_id=auth.uid() and week_key=w) into logged;
 return jsonb_build_object('unlocked',coalesce(lvl,1)>=20,'ready',pending.id is not null,'logged_this_week',logged,'can_log',coalesce(lvl,1)>=20 and not logged and pending.id is null,
 'activity',pending.activity,'logged_at',pending.logged_at,'resets',w+7,'bonus_pct',25);
end $f$;
revoke all on function public.rested_state() from public,anon;grant execute on function public.rested_state() to authenticated;

create function public.log_rested_hour(p_activity text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare gid uuid;d date;w date;lvl int;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_activity is null or length(trim(p_activity)) not between 1 and 160 then raise exception 'Describe the restful hour';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid() for update;
 if coalesce(lvl,1)<20 then raise exception 'Rested unlocks at level 20';end if;
 d:=public.qb_effective_date(gid);w:=d-(extract(isodow from d)::int-1);
 insert into public.rested_banks(guild_id,user_id,week_key,activity) values(gid,auth.uid(),w,trim(p_activity));
 insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
 values(gid,auth.uid(),auth.uid(),'rested_ready','Banked Rested after an hour of intentional rest','private',jsonb_build_object('activity',trim(p_activity),'bonus_pct',25));
 return public.rested_state();
exception when unique_violation then raise exception 'Rested already banked or logged this week';
end $f$;
revoke all on function public.log_rested_hour(text) from public,anon;grant execute on function public.log_rested_hour(text) to authenticated;



create function game_private.apply_rested(p_completion uuid)
returns jsonb language plpgsql set search_path='' as $f$
declare c public.quest_completions;q public.quest_templates;r public.quest_completion_rewards;bank public.rested_banks;
 base_xp int;target int;step int;bonus int;actor_bonus int:=0;xp int;rewards jsonb;extras jsonb:='[]';
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into c from public.quest_completions where id=p_completion for update;
 if not found or c.reversed_at is not null or c.completed_by<>auth.uid() or not public.is_guild_member(c.guild_id) then raise exception 'Completion unavailable';end if;
 if c.effective_date<>public.qb_effective_date(c.guild_id) then raise exception 'Use today''s completion';end if;
 select * into q from public.quest_templates where id=c.quest_id;
 base_xp:=q.xp_personal;
 if q.recurrence->>'type'='daily' then
  target:=greatest(1,coalesce((q.recurrence->>'count_target')::int,1));
  if target>1 then
   step:=substring(c.occurrence_key from ':step:([0-9]+)$')::int;
   base_xp:=floor(q.xp_personal::numeric/target)::int;
   if step=target then base_xp:=q.xp_personal-base_xp*(target-1);end if;
  end if;
 end if;
 if base_xp<=0 then return jsonb_build_object('actor_bonus',0,'rested_rewards',extras);end if;
 for r in select * from public.quest_completion_rewards where completion_id=c.id order by user_id for update loop
  perform 1 from public.player_progress_public where guild_id=c.guild_id and user_id=r.user_id and level>=20 for update;
  if not found then continue;end if;
  select * into bank from public.rested_banks where guild_id=c.guild_id and user_id=r.user_id and consumed_at is null and logged_at<=c.completed_at for update;
  if not found then continue;end if;
  bonus:=greatest(1,round(base_xp*.25)::int);
  update public.rested_banks set consumed_at=now(),completion_id=c.id where id=bank.id;
  update public.quest_completion_rewards set personal_xp_awarded=personal_xp_awarded+bonus,metadata=metadata||jsonb_build_object('rested_bonus',bonus) where completion_id=c.id and user_id=r.user_id;
  update public.player_progress_public set personal_xp=personal_xp+bonus,updated_at=now() where guild_id=c.guild_id and user_id=r.user_id returning personal_xp into xp;
  update public.player_progress_public set level=public.qb_level_for_xp(xp),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(xp)) where guild_id=c.guild_id and user_id=r.user_id;
  extras:=extras||jsonb_build_array(jsonb_build_object('user_id',r.user_id,'bonus',bonus));
  if r.user_id=auth.uid() then actor_bonus:=bonus;end if;
 end loop;
 select jsonb_agg(jsonb_build_object('user_id',user_id,'personal_xp',personal_xp_awarded)) into rewards from public.quest_completion_rewards where completion_id=c.id;
 if jsonb_array_length(extras)>0 then
  update public.quest_completions set modifiers=modifiers||jsonb_build_array(jsonb_build_object('kind','ability','name','Rested','rewards',extras)) where id=c.id;
  update public.activity_events set personal_xp=personal_xp+actor_bonus,
    metadata=jsonb_set(metadata,'{rewards}',rewards)||jsonb_build_object('rested_rewards',extras)
    where actor_user_id=auth.uid() and event_type='quest_complete' and metadata->>'completion_id'=c.id::text;
 end if;
 return jsonb_build_object('actor_bonus',actor_bonus,'rested_rewards',extras,'rewards',rewards);
end $f$;
revoke all on function game_private.apply_rested(uuid) from public,anon,authenticated;

create function public.complete_quest_rested(p_quest_id uuid,p_occurrence_key text,p_source text default 'journal')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare result jsonb;bonus jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 result:=public.complete_quest(p_quest_id,p_occurrence_key,p_source);
 bonus:=game_private.apply_rested((result->>'completion_id')::uuid);
 return result||jsonb_build_object('rested_rewards',bonus->'rested_rewards','rewards',bonus->'rewards','personal_xp_each',(result->>'personal_xp_each')::int+(bonus->>'actor_bonus')::int);
end $f$;
revoke all on function public.complete_quest_rested(uuid,text,text) from public,anon;grant execute on function public.complete_quest_rested(uuid,text,text) to authenticated;

create function public.use_second_wind_rested(p_kind text,p_target uuid,p_occurrence_key text default null,p_source text default 'journal')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare result jsonb;bonus jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 result:=public.use_second_wind(p_kind,p_target,p_occurrence_key,p_source);
 if p_kind='quest' then
  bonus:=game_private.apply_rested((result->>'completion_id')::uuid);
  result:=result||jsonb_build_object('rested_rewards',bonus->'rested_rewards','rewards',bonus->'rewards','personal_xp_each',(result->>'personal_xp_each')::int+(bonus->>'actor_bonus')::int);
 end if;
 return result;
end $f$;
revoke all on function public.use_second_wind_rested(text,uuid,text,text) from public,anon;grant execute on function public.use_second_wind_rested(text,uuid,text,text) to authenticated;

create function public.complete_gauntlet_rested(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare result jsonb;bonus jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 result:=public.complete_gauntlet_challenge(p_challenge_id);
 if result->>'quest_completion_id' is not null then
  bonus:=game_private.apply_rested((result->>'quest_completion_id')::uuid);
  result:=result||jsonb_build_object('rested_rewards',bonus->'rested_rewards');
  if result->'quest_reward' is not null and result->'quest_reward'<>'null'::jsonb then
    result:=jsonb_set(result,'{quest_reward,personal_xp_each}',to_jsonb((result#>>'{quest_reward,personal_xp_each}')::int+(bonus->>'actor_bonus')::int));
  else result:=result||jsonb_build_object('personal_xp',coalesce((result->>'personal_xp')::int,0)+(bonus->>'actor_bonus')::int);end if;
 end if;
 return result;
end $f$;
revoke all on function public.complete_gauntlet_rested(uuid) from public,anon;grant execute on function public.complete_gauntlet_rested(uuid) to authenticated;
