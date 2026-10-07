-- Transactional fixtures: no quest history, XP, or user state survives this test.
begin;
do $$
declare q public.quest_templates%rowtype; uid uuid; c jsonb; typ text; d date;
begin
 select * into q from public.quest_templates limit 1;
 select user_id into uid from public.guild_members where guild_id=q.guild_id limit 1;
 q.id:=gen_random_uuid();q.key:='recurrence-test-'||q.id;q.title:='Recurrence test';q.owner_type:='shared';q.created_at:='2026-01-01';
 q.assigned_user_id:=null;q.assignee_key:=null;q.active:=true;q.visibility:='guild';
 insert into public.quest_templates select q.*;
 foreach typ in array array['daily','repeatable','once'] loop
   q.recurrence:=jsonb_build_object('type',typ);
   insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
   values(q.guild_id,q.id,uid,typ,'2026-10-01');
   c:=game_private.quest_cycle(q,uid,'2026-10-01');assert (c->>'complete')::boolean;
   c:=game_private.quest_cycle(q,uid,'2026-10-02');assert (c->>'complete')::boolean=(typ='once');
   delete from public.quest_completions where quest_id=q.id;
 end loop;
 foreach typ in array array['2','3'] loop
   q.recurrence:=jsonb_build_object('type','interval','unit','weeks','count',typ::int,'anchor','last_completion');
   insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
   values(q.guild_id,q.id,uid,'legacy-month-key','2026-09-25');
   d:='2026-09-25'::date+7*typ::int;
   c:=game_private.quest_cycle(q,uid,d-1);assert (c->>'complete')::boolean;
   c:=game_private.quest_cycle(q,uid,d);assert (c->>'available')::boolean;
   delete from public.quest_completions where quest_id=q.id;
 end loop;
 q.recurrence:='{"type":"interval","unit":"months","count":1}';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,'legacy','2026-01-31');
 c:=game_private.quest_cycle(q,uid,'2026-02-27');assert not (c->>'available')::boolean;
 c:=game_private.quest_cycle(q,uid,'2026-02-28');assert (c->>'available')::boolean;
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"frequency","period":"quarter","target":1}';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,'frequency:2026-09','2026-09-30');
 c:=game_private.quest_cycle(q,uid,'2026-09-30');assert (c->>'complete')::boolean;
 c:=game_private.quest_cycle(q,uid,'2026-10-01');assert (c->>'available')::boolean;
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"frequency","period":"month","target":2}';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,'frequency:2026-10','2026-10-01');
 c:=game_private.quest_cycle(q,uid,'2026-10-02');assert (c->>'available')::boolean and c->>'count'='1' and c->>'occurrence_key' like '%step:2';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,'frequency:2026-10:step:2','2026-10-02');
 c:=game_private.quest_cycle(q,uid,'2026-10-03');assert (c->>'complete')::boolean;
 c:=game_private.quest_cycle(q,uid,'2026-11-01');assert (c->>'available')::boolean;
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"monthly_dates","days":[1,15]}';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,'monthly_dates:2026-10','2026-10-01');
 c:=game_private.quest_cycle(q,uid,'2026-10-14');assert (c->>'complete')::boolean;
 c:=game_private.quest_cycle(q,uid,'2026-10-15');assert (c->>'available')::boolean;
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"seasonal","month":10}';
 c:=game_private.quest_cycle(q,uid,'2026-10-31');assert (c->>'available')::boolean;
 c:=game_private.quest_cycle(q,uid,'2026-11-01');assert not (c->>'active')::boolean;
 q.recurrence:='{"type":"seasonal_wildcard"}';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,'seasonal_wildcard:2026','2026-12-20');
 c:=game_private.quest_cycle(q,uid,'2027-02-28');assert (c->>'complete')::boolean;
 c:=game_private.quest_cycle(q,uid,'2027-03-01');assert (c->>'available')::boolean;
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"room_slots","slots":["Bathroom 1","Bathroom 2","Bathroom 3"]}';
 c:=game_private.quest_cycle(q,uid,'2026-10-07');assert c->>'slot'='Bathroom 1' and c->>'target'='3';
 insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,c->>'occurrence_key','2026-10-07');
 c:=game_private.quest_cycle(q,uid,'2026-10-07');assert c->>'slot'='Bathroom 2';
 delete from public.quest_completions where quest_id=q.id;
 q.recurrence:='{"type":"daily","count_target":3}';
 c:=game_private.quest_cycle(q,uid,'2026-10-07');assert c->>'target'='3';
 -- Individual histories must not be blocked by another player's completion.
 q.owner_type:='individual';
 insert into public.quest_completions(guild_id,quest_id,completed_by,subject_user_id,occurrence_key,effective_date)
 values(q.guild_id,q.id,uid,(select user_id from public.guild_members where guild_id=q.guild_id and user_id<>uid limit 1),'scope-test','2026-10-07');
 c:=game_private.quest_cycle(q,uid,'2026-10-07');assert c->>'count'='0';
end $$;
rollback;
