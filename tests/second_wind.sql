begin;
do $test$
declare gid uuid;uid uuid;other_uid uuid;d date;q public.quest_templates;t public.training_assignments;result jsonb;result2 jsonb;before_xp int;other_xp int;failed boolean;uses_before int;
begin
 select guild_id,user_id into strict gid,uid from public.guild_members where lower(player_key)='kate';
 select user_id into strict other_uid from public.guild_members where guild_id=gid and lower(player_key)='drew';
 update public.guilds set playtest_day_offset=coalesce(playtest_day_offset,0)+2520 where id=gid;d:=public.qb_effective_date(gid);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select * into strict q from public.quest_templates where guild_id=gid and key='long-dog-walk';
 update public.player_progress_public set personal_xp=1350,level=4 where guild_id=gid and user_id=uid;
 failed:=false;begin perform public.use_second_wind('quest',q.id,'repeatable:'||d,'journal');exception when others then failed:=true;end;assert failed,'Low-level use allowed';
 assert not exists(select 1 from public.second_wind_uses where guild_id=gid and user_id=uid and week_key=d-(extract(isodow from d)::int-1));
 update public.player_progress_public set personal_xp=2400,level=5 where guild_id=gid and user_id in (uid,other_uid);
 select * into strict t from public.training_assignments where guild_id=gid and user_id=uid order by assignment_date desc limit 1;
 t.id:=gen_random_uuid();t.assignment_date:=d;t.completed_at:=null;t.replaced:=false;t.bonus_claimed_at:=null;t.bonus_reason:=null;t.bonus_personal_xp:=0;t.bonus_campaign_xp:=0;t.bonus_campaign_id:=null;
 insert into public.training_assignments select(t).*;
 result:=public.use_second_wind('training',t.id);
 assert (result->>'second_wind_bonus')::int=t.xp_personal;
 assert (select personal_xp=2400+(result->>'personal_xp')::int from public.player_progress_public where guild_id=gid and user_id=uid);
 assert (public.second_wind_state()->>'used')::boolean;
 failed:=false;begin perform public.use_second_wind('quest',q.id,'repeatable:'||d,'journal');exception when others then failed:=true;end;assert failed,'Second weekly use allowed';
 assert not (game_private.quest_cycle(q,uid,d)->>'complete')::boolean,'Failed weekly attempt completed the quest';
 perform public.claim_training_bonus(t.id,'more');
 perform public.undo_training_assignment(t.id);
 assert (select personal_xp=2400 from public.player_progress_public where guild_id=gid and user_id=uid),'Undo failed to reverse training, Second Wind, and More or Harder';
 assert (public.second_wind_state()->>'used')::boolean,'Undo should not refund weekly ability use';
 perform set_config('request.jwt.claim.sub',other_uid::text,true);
 assert (public.second_wind_state()->>'ready')::boolean,'Partner shared cooldown';
 -- Completing one co-op log boosts only the activating player.
 select * into strict q from public.quest_templates where guild_id=gid and key='walk-arthur';
 result:=public.use_second_wind('quest',q.id,d::text||':step:1','journal');
 assert (result->>'second_wind_bonus')::int=20,'Daily logs use a per-log base reward';
 assert (select (max(personal_xp_awarded) filter(where user_id=other_uid))=(max(personal_xp_awarded) filter(where user_id=uid))+20 from public.quest_completion_rewards where completion_id=(result->>'completion_id')::uuid),'Bonus leaked to co-op partner';
 perform public.undo_quest_completion((result->>'completion_id')::uuid);
 assert (select personal_xp=2400 from public.player_progress_public where guild_id=gid and user_id in(uid,other_uid) limit 1),'Quest undo failed';
 update public.guilds set playtest_day_offset=playtest_day_offset+7 where id=gid;d:=public.qb_effective_date(gid);
 assert (public.second_wind_state()->>'ready')::boolean,'Weekly reset failed';
 -- Wrong target is rejected without consuming the use.
 select * into strict q from public.quest_templates where guild_id=gid and key='make-bread';
 failed:=false;begin perform public.use_second_wind('quest',q.id,'repeatable:'||d,'journal');exception when others then failed:=true;end;assert failed,'Nonfitness task accepted';
 assert (public.second_wind_state()->>'ready')::boolean;
 failed:=false;begin perform public.use_second_wind('training',t.id);exception when others then failed:=true;end;assert failed,'Another player/past workout accepted';
 assert not has_table_privilege('authenticated','public.second_wind_uses','INSERT');
 assert not has_function_privilege('anon','public.use_second_wind(text,uuid,text,text)','EXECUTE');
end $test$;
rollback;
