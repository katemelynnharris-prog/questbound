begin;do $test$
declare gid uuid;uid uuid;actor uuid;beforexp int;beforec int;s jsonb;offset_before int;
begin
 select guild_id,user_id into gid,actor from public.guild_members where lower(player_key)='kate' limit 1;
 select user_id into uid from public.guild_members where guild_id=gid and lower(player_key)='drew';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 delete from public.locked_in_cheat_days where guild_id=gid;
 update public.quest_completions set reversed_at=now() where guild_id=gid and effective_date=public.qb_effective_date(gid) and quest_id in(select id from public.quest_templates where guild_id=gid and key in ('meet-protein-goal','meet-calorie-goal'));
 select personal_xp into beforexp from public.player_progress_public where guild_id=gid and user_id=uid;
 select count(*) into beforec from public.quest_completions where guild_id=gid;
 s:=public.use_locked_in_cheat_day();
 assert (s->>'used_this_week')::boolean and not (s->>'can_use')::boolean,'weekly state';
 assert s->'days' @> jsonb_build_array(public.qb_effective_date(gid)),'today protected';
 assert (select personal_xp from public.player_progress_public where guild_id=gid and user_id=uid)=beforexp,'no XP';
 assert (select count(*) from public.quest_completions where guild_id=gid)=beforec,'no fake quest completions';
 begin perform public.use_locked_in_cheat_day();raise exception 'Duplicate allowed';exception when others then if sqlerrm='Duplicate allowed' then raise;end if;end;
 select playtest_day_offset into offset_before from public.guilds where id=gid;
 update public.guilds set playtest_day_offset=coalesce(offset_before,0)+7 where id=gid;
 assert (public.locked_in_cheat_state()->>'can_use')::boolean,'next week resets';
 update public.guild_members set role='member' where guild_id=gid and user_id=actor;
 begin perform public.use_locked_in_cheat_day();raise exception 'Unauthorized allowed';exception when others then if sqlerrm='Unauthorized allowed' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.use_locked_in_cheat_day();
 assert (select count(*) from public.locked_in_cheat_days where guild_id=gid)=2,'Drew can use next week';
 assert not has_function_privilege('anon','public.use_locked_in_cheat_day()','EXECUTE'),'anon denied';
end $test$;rollback;select 'Passed: once weekly, next-week reset, Drew/admin only, no XP or fake nutrition completions, preserved history, anon denied' result;
