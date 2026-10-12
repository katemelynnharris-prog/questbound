begin;
do $test$
declare gid uuid;uid uuid;peer uuid;d date;q public.quest_templates;other public.quest_templates;result jsonb;before_xp int;peer_xp int;failed boolean;
begin
 select guild_id,user_id into strict gid,uid from public.guild_members where lower(player_key)='kate';
 select user_id into strict peer from public.guild_members where guild_id=gid and lower(player_key)='drew';
 update public.guilds set playtest_day_offset=coalesce(playtest_day_offset,0)+2520 where id=gid;d:=public.qb_effective_date(gid);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 update public.player_progress_public set personal_xp=48600,level=19 where guild_id=gid and user_id=uid;
 failed:=false;begin perform public.log_rested_hour('An hour without screens');exception when others then failed:=true;end;assert failed,'Level gate bypassed';
 update public.player_progress_public set personal_xp=54150,level=20 where guild_id=gid and user_id in(uid,peer);
 -- Older completions cannot consume a newly logged hour.
 select * into strict q from public.quest_templates where guild_id=gid and key='make-bread';
 result:=public.complete_quest(q.id,'repeatable:'||d,'journal');
 update public.quest_completions set completed_at=now()-interval '1 minute' where id=(result->>'completion_id')::uuid;
 perform public.log_rested_hour('An hour without screens');
 perform game_private.apply_rested((result->>'completion_id')::uuid);
 assert (public.rested_state()->>'ready')::boolean,'Retroactive consumption allowed';
 failed:=false;begin perform public.log_rested_hour('Reading');exception when others then failed:=true;end;assert failed,'Duplicate weekly log allowed';
 -- A failed quest leaves the bank intact.
 select * into strict other from public.quest_templates where guild_id=gid and recurrence->>'type'='seasonal' and (recurrence->>'month')::int<>extract(month from d) limit 1;
 failed:=false;begin perform public.complete_quest_rested(other.id,'seasonal:test','journal');exception when others then failed:=true;end;assert failed;
 assert (public.rested_state()->>'ready')::boolean;
 perform set_config('request.jwt.claim.sub',peer::text,true);perform public.log_rested_hour('Reading for enjoyment');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select * into strict q from public.quest_templates where guild_id=gid and key='finish-a-book';
 select personal_xp into before_xp from public.player_progress_public where guild_id=gid and user_id=uid;
 result:=public.complete_quest_rested(q.id,'repeatable:'||d,'journal');
 assert (result#>>'{rested_rewards,0,bonus}')::int=50;
 assert (select personal_xp=before_xp+(result->>'personal_xp_each')::int from public.player_progress_public where guild_id=gid and user_id=uid);
 assert not (public.rested_state()->>'ready')::boolean;
 perform public.undo_quest_completion((result->>'completion_id')::uuid);
 assert (select personal_xp=before_xp from public.player_progress_public where guild_id=gid and user_id=uid),'Undo did not include Rested';
 assert not (public.rested_state()->>'ready')::boolean,'Weekly charge refunded unexpectedly';
 perform set_config('request.jwt.claim.sub',peer::text,true);assert (public.rested_state()->>'ready')::boolean,'Partner bank was consumed';
 select personal_xp into peer_xp from public.player_progress_public where guild_id=gid and user_id=peer;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select * into strict q from public.quest_templates where guild_id=gid and key='read-out-loud';
 result:=public.complete_quest_rested(q.id,d::text,'journal');
 assert (result#>>'{rested_rewards,0,user_id}')=peer::text;
 assert (result#>>'{rested_rewards,0,bonus}')::int=25;
 perform public.undo_quest_completion((result->>'completion_id')::uuid);
 assert (select personal_xp=peer_xp from public.player_progress_public where guild_id=gid and user_id=peer),'Co-op partner undo failed';
 -- A fresh week opens a new hour and stacks correctly with Second Wind's fitness log.
 update public.guilds set playtest_day_offset=playtest_day_offset+7 where id=gid;d:=public.qb_effective_date(gid);
 assert (public.rested_state()->>'can_log')::boolean;
 perform public.log_rested_hour('Relaxing outside');
 select * into strict q from public.quest_templates where guild_id=gid and key='walk-arthur';
 result:=public.use_second_wind_rested('quest',q.id,d::text||':step:1','journal');
 assert (result->>'second_wind_bonus')::int=20;
 assert (result#>>'{rested_rewards,0,bonus}')::int=5;
 assert not (public.rested_state()->>'ready')::boolean;
 assert not has_table_privilege('authenticated','public.rested_banks','INSERT');
 assert not has_function_privilege('anon','public.log_rested_hour(text)','EXECUTE');
 assert not has_function_privilege('authenticated','game_private.apply_rested(uuid)','EXECUTE');
end $test$;
rollback;
