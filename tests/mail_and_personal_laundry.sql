begin;do $test$
declare uid uuid;partner uuid;gid uuid;q public.quest_templates;r jsonb;cid uuid;before int;
begin
 select guild_id,user_id into gid,uid from public.guild_members where lower(player_key)='kate' limit 1;
 select user_id into partner from public.guild_members where guild_id=gid and lower(player_key)='drew';
 update public.quest_completions set reversed_at=now() where guild_id=gid and effective_date=public.qb_effective_date(gid) and quest_id in(select id from public.quest_templates where guild_id=gid and key in ('fold-laundry','check-the-mail'));
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select * into q from public.quest_templates where guild_id=gid and key='fold-laundry';
 assert q.recurrence->>'completion_scope'='player';
 select personal_xp into before from public.player_progress_public where guild_id=gid and user_id=partner;
 r:=public.complete_quest_abilities(q.id,game_private.quest_cycle(q,uid,public.qb_effective_date(gid))->>'occurrence_key','journal');
 cid:=(r->>'completion_id')::uuid;
 assert (select count(*) from public.quest_completion_rewards where completion_id=cid)=1;
 assert (select personal_xp from public.player_progress_public where guild_id=gid and user_id=partner)=before;
 assert (game_private.quest_cycle(q,partner,public.qb_effective_date(gid))->>'available')::boolean,'partner remains available';
 perform set_config('request.jwt.claim.sub',partner::text,true);
 perform public.complete_quest_abilities(q.id,game_private.quest_cycle(q,partner,public.qb_effective_date(gid))->>'occurrence_key','journal');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select * into q from public.quest_templates where guild_id=gid and key='check-the-mail';
 assert q.xp_personal=20 and q.xp_campaign=5 and not(q.recurrence->>'daily_ledger')::boolean;
 r:=public.complete_quest_abilities(q.id,game_private.quest_cycle(q,uid,public.qb_effective_date(gid))->>'occurrence_key','journal');
 assert not(game_private.quest_cycle(q,partner,public.qb_effective_date(gid))->>'available')::boolean,'mail is household shared';
 assert (select count(*) from public.quest_completion_rewards where completion_id=(r->>'completion_id')::uuid)=1;
end $test$;rollback;select 'Passed: independent laundry completion/XP, shared mail completion, 20/5 base XP, no Daily Ledger addition' result;
