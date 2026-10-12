create table public.locked_in_cheat_days(
 guild_id uuid not null references public.guilds(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 cheat_date date not null,week_key date not null,recorded_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(guild_id,user_id,cheat_date),unique(guild_id,user_id,week_key),
 check(week_key=cheat_date-(extract(isodow from cheat_date)::int-1)));
alter table public.locked_in_cheat_days enable row level security;
create policy locked_in_cheat_days_guild on public.locked_in_cheat_days for select to authenticated using(public.is_guild_member(guild_id));
revoke all on public.locked_in_cheat_days from public,anon,authenticated;grant select on public.locked_in_cheat_days to authenticated;

create function public.locked_in_cheat_state()
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare gid uuid;uid uuid;role_key text;d date;w date;used boolean;secured boolean;days jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id,role into gid,role_key from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select user_id into uid from public.guild_members where guild_id=gid and lower(player_key)='drew' order by joined_at limit 1;
 if uid is null then raise exception 'Drew has not joined';end if;
 d:=public.qb_effective_date(gid);w:=d-(extract(isodow from d)::int-1);
 select coalesce(jsonb_agg(cheat_date order by cheat_date),'[]') into days from public.locked_in_cheat_days where guild_id=gid and user_id=uid and cheat_date<=d;
 used:=exists(select 1 from public.locked_in_cheat_days where guild_id=gid and user_id=uid and week_key=w);
 secured:=not exists(select 1 from public.quest_templates q where q.guild_id=gid and q.key in ('meet-protein-goal','meet-calorie-goal') and not exists(select 1 from public.quest_completions c where c.quest_id=q.id and c.reversed_at is null and coalesce(c.subject_user_id,c.completed_by)=uid and c.effective_date=d));
 return jsonb_build_object('days',days,'today',d,'used_this_week',used,'can_use',(auth.uid()=uid or role_key='admin') and not used and not secured,'resets',w+7,'secured_by_goals',secured);
end $f$;
revoke all on function public.locked_in_cheat_state() from public,anon;grant execute on function public.locked_in_cheat_state() to authenticated;

create function public.use_locked_in_cheat_day()
returns jsonb language plpgsql security definer set search_path='' as $f$
declare gid uuid;uid uuid;role_key text;d date;w date;s jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id,role into gid,role_key from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select user_id into uid from public.guild_members where guild_id=gid and lower(player_key)='drew' order by joined_at limit 1;
 if uid is null or (auth.uid()<>uid and role_key<>'admin') then raise exception 'Drew or a Guild admin must use this button';end if;
 perform 1 from public.player_progress_public where guild_id=gid and user_id=uid for update;
 s:=public.locked_in_cheat_state();
 if (s->>'used_this_week')::boolean then raise exception 'Cheat Day already used this week';end if;
 if (s->>'secured_by_goals')::boolean then raise exception 'Today is already secured by both goals';end if;
 d:=public.qb_effective_date(gid);w:=d-(extract(isodow from d)::int-1);
 insert into public.locked_in_cheat_days(guild_id,user_id,cheat_date,week_key,recorded_by) values(gid,uid,d,w,auth.uid());
 insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
 values(gid,auth.uid(),uid,'locked_in','Drew used his weekly Cheat Day','guild',jsonb_build_object('effective_date',d,'reward_neutral',true,'cheat_day',true));
 return public.locked_in_cheat_state();
exception when unique_violation then raise exception 'Cheat Day already used this week';
end $f$;
revoke all on function public.use_locked_in_cheat_day() from public,anon;grant execute on function public.use_locked_in_cheat_day() to authenticated;
