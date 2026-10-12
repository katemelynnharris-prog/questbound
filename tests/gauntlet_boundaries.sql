begin;
do $$
declare q public.quest_templates%rowtype; uid uuid; other_uid uuid; today date; result jsonb; challenge uuid; ckey text; msg text; i int;
begin
 select * into q from public.quest_templates where key='complete-freelance-project' and guild_id in(select id from public.guilds where slug='questbound-harris');
 select user_id into uid from public.guild_members where guild_id=q.guild_id and lower(player_key)='kate';
 select user_id into other_uid from public.guild_members where guild_id=q.guild_id and lower(player_key)='drew';
 perform set_config('request.jwt.claim.sub',uid::text,true);today:=public.qb_effective_date(q.guild_id);
 q.id:=gen_random_uuid();q.key:='gauntlet-boundary-test-'||q.id;q.title:='Boundary test';q.gauntlet_eligible:=true;q.random_eligible:=false;
 insert into public.quest_templates select q.*;
 q.owner_type:='individual';q.assigned_user_id:=uid;q.assignee_key:='kate';
 assert game_private.gauntlet_eligible_now(q,uid,today);
 assert not game_private.gauntlet_eligible_now(q,other_uid,today);
 q.assigned_user_id:=null;assert not game_private.gauntlet_eligible_now(q,other_uid,today);
 q.assignee_key:=null;assert not game_private.gauntlet_eligible_now(q,other_uid,today);
 q.owner_type:='personal_daily';q.recurrence:='{"type":"daily"}';
 assert game_private.gauntlet_eligible_now(q,other_uid,today);
 q.owner_type:='shared';q.recurrence:='{"type":"seasonal","month":12}';
 assert game_private.gauntlet_eligible_now(q,uid,'2026-12-01');
 assert not game_private.gauntlet_eligible_now(q,uid,'2026-10-12');
 q.recurrence:='{"type":"interval","unit":"weeks","count":2}';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,'test-interval',today-7);
 assert not game_private.gauntlet_eligible_now(q,uid,today);
 assert game_private.gauntlet_eligible_now(q,uid,today+7);
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"once"}';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,'once',today-1);
 assert not game_private.gauntlet_eligible_now(q,uid,today);
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"daily","count_target":3}';
 for i in 1..3 loop
   insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
   values(q.guild_id,q.id,uid,today::text||':step:'||i,today);
 end loop;
 assert not game_private.gauntlet_eligible_now(q,other_uid,today);
 assert game_private.gauntlet_eligible_now(q,other_uid,today+1);
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"weekly","days":["Thu"]}';
 assert not game_private.gauntlet_eligible_now(q,uid,'2026-10-12');
 assert game_private.gauntlet_eligible_now(q,uid,'2026-10-15');
 -- Restrict the draw to this fixture, then test real draw/reroll/claim pathways.
 update public.quest_templates set gauntlet_eligible=false where guild_id=q.guild_id and id<>q.id;
 update public.quest_templates set owner_type='personal_daily',recurrence='{"type":"daily"}',assigned_user_id=null,assignee_key=null where id=q.id;
 result:=public.admin_force_gauntlet('Drew');challenge:=(result->>'challenge_id')::uuid;
 select occurrence_key into ckey from public.gauntlet_challenges where id=challenge;
 assert ckey=today::text;
 q.owner_type:='personal_daily';q.recurrence:='{"type":"daily"}';
 assert not game_private.gauntlet_eligible_now(q,other_uid,today);
 assert game_private.gauntlet_eligible_now(q,other_uid,today,challenge);
 perform set_config('request.jwt.claim.sub',other_uid::text,true);
 result:=public.complete_gauntlet_challenge(challenge);
 assert result->>'personal_xp'='75';
 assert exists(select 1 from public.quest_completions where id=(result->>'quest_completion_id')::uuid and subject_user_id=other_uid and occurrence_key=ckey);
 begin perform public.complete_gauntlet_challenge(challenge);raise exception 'Duplicate claim';exception when others then get stacked diagnostics msg=message_text;assert msg='Active Gauntlet not available to you',msg;end;
 -- A challenge from a different daily occurrence expires without awarding XP.
 insert into public.gauntlet_challenges(guild_id,source_user_id,target_user_id,quest_id,objective,occurrence_key)
 values(q.guild_id,uid,other_uid,q.id,'Expired test',(today-1)::text) returning id into challenge;
 result:=public.complete_gauntlet_challenge(challenge);assert (result->>'expired')::boolean;
 assert (select status='expired' from public.gauntlet_challenges where id=challenge);
end $$;
rollback;
