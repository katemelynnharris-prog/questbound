begin;
do $$
declare gid uuid; uid uuid; other_uid uuid; qid uuid; cid uuid; today date; wk date; result jsonb; msg text; i int; completion uuid;
begin
 select guild_id,user_id into gid,uid from public.guild_members where role='admin' limit 1;
 select user_id into other_uid from public.guild_members where guild_id=gid and user_id<>uid limit 1;
 select id into qid from public.quest_templates where guild_id=gid and key='no-overspending-week';
 perform set_config('request.jwt.claim.sub',uid::text,true);
 update public.guilds set playtest_day_offset=0 where id=gid;
 today:=public.qb_effective_date(gid);wk:=today-(extract(isodow from today)::int-1);
 update public.guilds set playtest_day_offset=wk+6-today where id=gid;
 today:=wk+6;
 delete from public.budget_weeks where guild_id=gid;
 delete from public.quest_completions where quest_id=qid;
 delete from public.reward_events where guild_id=gid and event_key like 'weekly-failure:'||qid::text||':%';
 select id into cid from public.campaigns where guild_id=gid and status='active' order by started_at desc limit 1;
 assert cid is not null,'An active campaign is required for penalty fixtures';
 update public.campaigns set campaign_xp=500 where id=cid;
 begin perform public.record_budget_day(today+1,'success');raise exception 'Future allowed';exception when others then get stacked diagnostics msg=message_text;assert msg='Only elapsed days of this week can be changed',msg;end;
 begin perform public.record_budget_day(wk-1,'success');raise exception 'Last week allowed';exception when others then get stacked diagnostics msg=message_text;assert msg='Only elapsed days of this week can be changed',msg;end;
 begin perform public.complete_quest(qid,'forged-key','journal');raise exception 'Early claim allowed';exception when others then get stacked diagnostics msg=message_text;assert msg='Record seven successful budget days before claiming the weekly reward',msg;end;
 result:=public.record_budget_day(wk,'overspent');assert (result->>'failed')::boolean;
 assert (select campaign_xp=450 from public.campaigns where id=cid);
 perform public.record_budget_day(wk,'overspent');perform public.record_budget_day(wk+1,'overspent');
 assert (select campaign_xp=450 from public.campaigns where id=cid);
 perform public.record_budget_day(wk,'success');assert (select campaign_xp=450 from public.campaigns where id=cid);
 result:=public.record_budget_day(wk+1,'success');assert not (result->>'failed')::boolean;
 assert (select campaign_xp=500 from public.campaigns where id=cid);
 -- Both players see and edit the same household record.
 perform set_config('request.jwt.claim.sub',other_uid::text,true);
 result:=public.budget_week_state();assert result->>'successful_days'='2';
 perform public.record_budget_day(wk+2,'success');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 for i in 3..6 loop perform public.record_budget_day(wk+i,'success');end loop;
 result:=public.budget_week_state();assert (result->>'claimable')::boolean and result->>'successful_days'='7';
 -- Seed consecutive weekly successes; this is reward-neutral and rolled back.
 for i in 1..3 loop
   insert into public.quest_completions(guild_id,quest_id,completed_by,occurrence_key,effective_date)
   values(gid,qid,uid,'budget-history-test:'||i,wk-7*i+6);
 end loop;
 result:=public.budget_week_state();assert result->>'streak'='3' and result->>'best_streak'='3';
 result:=public.complete_quest(qid,'ignored-client-key','journal');completion:=(result->>'completion_id')::uuid;
 result:=public.budget_week_state();assert (result->>'claimed')::boolean and result->>'streak'='4' and result->>'best_streak'='4';
 assert (select count(*)=2 from public.quest_completion_rewards where completion_id=completion);
 begin perform public.complete_quest(qid,'another-key','journal');raise exception 'Duplicate claim allowed';exception when others then get stacked diagnostics msg=message_text;assert msg='Record seven successful budget days before claiming the weekly reward',msg;end;
 begin perform public.record_budget_day(wk,'pending');raise exception 'Claimed week edited';exception when others then get stacked diagnostics msg=message_text;assert msg='This week is secured; undo the weekly completion before editing',msg;end;
 -- Monday starts empty; successful streak survives until the new week fails.
 update public.guilds set playtest_day_offset=playtest_day_offset+1 where id=gid;
 result:=public.budget_week_state();assert result->>'successful_days'='0' and result->>'streak'='4' and not (result->>'claimed')::boolean;
 result:=public.record_budget_day(wk+7,'overspent');assert result->>'streak'='0' and result->>'best_streak'='4';
 result:=public.record_budget_day(wk+7,'success');assert result->>'streak'='4';
 assert not has_table_privilege('authenticated','public.budget_weeks','insert');
 assert not has_function_privilege('anon','public.record_budget_day(date,text)','execute');
end $$;
rollback;
