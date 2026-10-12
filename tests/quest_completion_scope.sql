-- Transactional regression checks: no test rewards or calendar changes persist.
begin;
do $test$
declare q public.quest_templates; other_car public.quest_templates; a uuid; b uuid; d date; reward jsonb; i int; k text;
begin
 select * into strict q from public.quest_templates where key='long-dog-walk' and active;
 select user_id into strict a from public.guild_members where guild_id=q.guild_id and lower(player_key)='kate';
 select user_id into strict b from public.guild_members where guild_id=q.guild_id and lower(player_key)='drew';
 update public.guilds set playtest_day_offset=coalesce(playtest_day_offset,0)+120 where id=q.guild_id;
 d:=public.qb_effective_date(q.guild_id);
 perform set_config('request.jwt.claim.sub',a::text,true);
 reward:=public.complete_quest(q.id,game_private.quest_cycle(q,a,d)->>'occurrence_key','journal');
 assert jsonb_array_length(reward->'rewards')=1;
 assert (game_private.quest_cycle(q,a,d)->>'complete')::boolean;
 assert (game_private.quest_cycle(q,b,d)->>'available')::boolean;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.complete_quest(q.id,game_private.quest_cycle(q,b,d)->>'occurrence_key','journal');
 select * into strict q from public.quest_templates where key='submit-audio-audition';
 for i in 1..3 loop perform public.complete_quest(q.id,game_private.quest_cycle(q,b,d)->>'occurrence_key','journal');end loop;
 assert (game_private.quest_cycle(q,b,d)->>'complete')::boolean;
 assert (game_private.quest_cycle(q,a,d)->>'count')::int=0;
 select * into strict q from public.quest_templates where key='cook-a-new-meal';
 reward:=public.complete_quest(q.id,game_private.quest_cycle(q,b,d)->>'occurrence_key','journal');
 assert jsonb_array_length(reward->'rewards')=1;
 assert (game_private.quest_cycle(q,a,d)->>'complete')::boolean;
 select * into strict q from public.quest_templates where key='attend-concert';
 reward:=public.complete_quest(q.id,game_private.quest_cycle(q,b,d)->>'occurrence_key','journal');
 assert jsonb_array_length(reward->'rewards')=2;
 assert (game_private.quest_cycle(q,a,d)->>'complete')::boolean;
 foreach k in array array['car-wash','vacuum-car','oil-change'] loop
  select * into strict q from public.quest_templates where key=k;
  select * into strict other_car from public.quest_templates where key=k||'-car-2' and guild_id=q.guild_id;
  perform public.complete_quest(q.id,game_private.quest_cycle(q,b,d)->>'occurrence_key','journal');
  assert (game_private.quest_cycle(q,a,d)->>'complete')::boolean;
  assert (game_private.quest_cycle(other_car,a,d)->>'available')::boolean;
 end loop;
end $test$;
rollback;
