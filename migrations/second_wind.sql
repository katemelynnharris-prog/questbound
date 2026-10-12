-- Isolated Second Wind implementation. Existing completion functions are unchanged.
create table public.second_wind_uses(
 guild_id uuid not null references public.guilds(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 week_key date not null,target_kind text not null check(target_kind in ('quest','training')),
 target_id uuid not null,quest_completion_id uuid references public.quest_completions(id) on delete cascade,
 personal_xp_bonus integer not null default 0 check(personal_xp_bonus>=0),
 used_at timestamptz not null default now(),primary key(guild_id,user_id,week_key));
alter table public.second_wind_uses enable row level security;
create policy second_wind_self on public.second_wind_uses for select to authenticated
 using(user_id=(select auth.uid()) and public.is_guild_member(guild_id));
revoke all on public.second_wind_uses from public,anon,authenticated;
grant select on public.second_wind_uses to authenticated;

create function public.second_wind_state()
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare gid uuid;d date;w date;lvl integer;u public.second_wind_uses;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 d:=public.qb_effective_date(gid);w:=d-(extract(isodow from d)::int-1);
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid();
 select * into u from public.second_wind_uses where guild_id=gid and user_id=auth.uid() and week_key=w;
 return jsonb_build_object('unlocked',coalesce(lvl,1)>=5,'used',u.user_id is not null,'ready',coalesce(lvl,1)>=5 and u.user_id is null,'week',w,'resets',w+7,'bonus',coalesce(u.personal_xp_bonus,0),
 'fitness_quests',(select coalesce(jsonb_agg(q.id),'[]'::jsonb) from public.quest_templates q where q.guild_id=gid and q.active and not q.hidden_encounter and public.can_view_quest(q.id)
 and (lower(q.category) in ('fitness','training','gym') or q.key in ('go-for-a-run','long-dog-walk','walk-arthur'))));
end $f$;
revoke all on function public.second_wind_state() from public,anon;
grant execute on function public.second_wind_state() to authenticated;

create function public.use_second_wind(p_kind text,p_target uuid,p_occurrence_key text default null,p_source text default 'journal')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare uid uuid:=auth.uid();gid uuid;d date;w date;lvl int;xp int;bonus int;result jsonb;q public.quest_templates;t public.training_assignments;evt uuid;count_target int:=1;step int:=1;rewards jsonb;
begin
 if uid is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=uid order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=uid;
 if coalesce(lvl,1)<5 then raise exception 'Second Wind unlocks at level 5';end if;
 d:=public.qb_effective_date(gid);w:=d-(extract(isodow from d)::int-1);
 if p_kind='quest' then
  select * into q from public.quest_templates where id=p_target and guild_id=gid and active for update;
  if not found or q.hidden_encounter or not public.can_view_quest(q.id) or not (lower(q.category) in ('fitness','training','gym') or q.key in ('go-for-a-run','long-dog-walk','walk-arthur')) then raise exception 'Choose an available fitness quest';end if;
 elsif p_kind='training' then
  select * into t from public.training_assignments where id=p_target and guild_id=gid and user_id=uid for update;
  if not found or t.assignment_date<>d or t.completed_at is not null then raise exception 'Choose today''s unfinished workout';end if;
 else raise exception 'Choose a fitness quest or workout';end if;
 -- Unique weekly row serializes simultaneous attempts. A failed completion rolls this back.
 insert into public.second_wind_uses(guild_id,user_id,week_key,target_kind,target_id) values(gid,uid,w,p_kind,p_target);
 if p_kind='quest' then
  result:=public.complete_quest(p_target,p_occurrence_key,p_source);
  bonus:=q.xp_personal;
  if q.recurrence->>'type'='daily' then
   count_target:=greatest(1,coalesce((q.recurrence->>'count_target')::int,1));
   step:=coalesce((result->>'count_current')::int,1);
   bonus:=floor(q.xp_personal::numeric/count_target)::int;
   if step=count_target then bonus:=q.xp_personal-bonus*(count_target-1);end if;
  end if;
  update public.quest_completion_rewards set personal_xp_awarded=personal_xp_awarded+bonus,
    metadata=metadata||jsonb_build_object('second_wind_bonus',bonus) where completion_id=(result->>'completion_id')::uuid and user_id=uid;
  if not found then raise exception 'Completion did not reward you';end if;
  select jsonb_agg(jsonb_build_object('user_id',user_id,'personal_xp',personal_xp_awarded)) into rewards
   from public.quest_completion_rewards where completion_id=(result->>'completion_id')::uuid;
  update public.quest_completions set modifiers=modifiers||jsonb_build_array(jsonb_build_object('kind','ability','name','Second Wind','user_id',uid,'personal_xp_bonus',bonus))
   where id=(result->>'completion_id')::uuid;
  update public.activity_events set personal_xp=personal_xp+bonus,
   metadata=jsonb_set(metadata,'{rewards}',rewards)||jsonb_build_object('second_wind_bonus',bonus)
   where actor_user_id=uid and event_type='quest_complete' and metadata->>'completion_id'=result->>'completion_id';
  update public.second_wind_uses set quest_completion_id=(result->>'completion_id')::uuid,personal_xp_bonus=bonus
   where guild_id=gid and user_id=uid and week_key=w;
  result:=result||jsonb_build_object('rewards',rewards);
 else
  result:=public.complete_training_assignment(p_target);bonus:=t.xp_personal;
  select id into evt from public.activity_events where guild_id=gid and actor_user_id=uid and event_type='training_complete' and metadata->>'training_assignment_id'=t.id::text order by created_at desc limit 1 for update;
  if evt is null then raise exception 'Training reward record unavailable';end if;
  update public.activity_events set personal_xp=personal_xp+bonus,metadata=metadata||jsonb_build_object('second_wind_bonus',bonus) where id=evt;
  update public.second_wind_uses set personal_xp_bonus=bonus where guild_id=gid and user_id=uid and week_key=w;
  result:=result||jsonb_build_object('personal_xp',coalesce((result->>'personal_xp')::int,0)+bonus);
 end if;
 update public.player_progress_public set personal_xp=personal_xp+bonus,updated_at=now() where guild_id=gid and user_id=uid returning personal_xp into xp;
 update public.player_progress_public set level=public.qb_level_for_xp(xp),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(xp)) where guild_id=gid and user_id=uid;
 return result||jsonb_build_object('second_wind_bonus',bonus,'second_wind_used',true);
exception when unique_violation then raise exception 'Second Wind has already been used this week';
end $f$;
revoke all on function public.use_second_wind(text,uuid,text,text) from public,anon;
grant execute on function public.use_second_wind(text,uuid,text,text) to authenticated;
