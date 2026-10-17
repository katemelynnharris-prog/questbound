CREATE OR REPLACE FUNCTION game_private.quest_cycle(p_q quest_templates, p_uid uuid, p_today date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 r jsonb:=p_q.recurrence; t text:=coalesce(r->>'type','once');
 s date; e date; last_date date; n integer:=0; target integer:=1;
 k text; due date; active boolean:=true; slot_day integer; span_days integer;
begin
 if t='once' then s:='0001-01-01';e:='9999-12-31';k:='once';
 elsif t in ('daily','repeatable') then
   s:=p_today;e:=p_today;k:=case when t='daily' then p_today::text else 'repeatable:'||p_today::text end;
   if t='daily' then target:=greatest(1,coalesce((r->>'count_target')::integer,1));end if;
 elsif t in ('weekly','room_slots') then
   s:=p_today-(extract(isodow from p_today)::integer-1);e:=s+6;k:='week:'||s;
   if t='room_slots' then target:=greatest(1,jsonb_array_length(coalesce(r->'slots','[]'::jsonb)));k:='room_slots:'||s;end if;
 elsif t='monthly_dates' then
   select max(value::integer) into slot_day from jsonb_array_elements_text(r->'days') where value::integer<=extract(day from p_today);
   s:=date_trunc('month',p_today)::date;
   if slot_day is null then
     s:=(s-interval '1 month')::date;
     select max(value::integer) into slot_day from jsonb_array_elements_text(r->'days');
   end if;
   s:=s+least(coalesce(slot_day,1),extract(day from (s+interval '1 month -1 day'))::integer)-1;
   select min(value::integer) into slot_day from jsonb_array_elements_text(r->'days') where value::integer>extract(day from p_today);
   e:=case when slot_day is null then (date_trunc('month',p_today)+interval '1 month -1 day')::date else date_trunc('month',p_today)::date+slot_day-2 end;
   k:='monthly_dates:'||s;due:=s;
 elsif t in ('monthly_fixed','frequency') then
   s:=date_trunc(case when t='monthly_fixed' then 'month' else coalesce(r->>'period','month') end,p_today)::date;
   e:=(s+case when r->>'period'='quarter' then interval '3 months' when r->>'period'='year' then interval '1 year' when r->>'period'='week' then interval '1 week' else interval '1 month' end-interval '1 day')::date;
   k:=t||':'||s;
   if t='frequency' then target:=greatest(1,coalesce((r->>'target')::integer,1));due:=e;
   else due:=s+least(coalesce((r->>'day')::integer,1),extract(day from e)::integer)-1;end if;
 elsif t='interval' then
  if r->>'anchor'='schedule' then
   span_days:=greatest(1,coalesce((r->>'count')::integer,1))*case when r->>'unit'='weeks' then 7 when r->>'unit'='days' then 1 else 0 end;
   if span_days<1 or r->>'start_date' is null then raise exception 'Scheduled intervals require a start date and days or weeks';end if;
   s:=(r->>'start_date')::date;
   if p_today>=s then s:=s+((p_today-s)/span_days)*span_days;end if;
   e:=s+span_days-1;due:=s;k:='interval:scheduled:'||s;
  else
   select max(coalesce(c.effective_date,(c.completed_at at time zone g.timezone)::date)) into last_date
   from public.quest_completions c join public.guilds g on g.id=c.guild_id
   where c.quest_id=p_q.id and c.reversed_at is null
     and ((p_q.owner_type not in ('individual','personal_daily') and coalesce(p_q.recurrence->>'completion_scope','household')<>'player') or coalesce(c.subject_user_id,c.completed_by)=p_uid)
     and coalesce(c.effective_date,(c.completed_at at time zone g.timezone)::date)<=p_today;
   due:=(coalesce(last_date,(p_q.created_at at time zone (select timezone from public.guilds where id=p_q.guild_id))::date)
     + make_interval(days=>case when r->>'unit'='days' then coalesce((r->>'count')::int,1) when r->>'unit'='weeks' then 7*coalesce((r->>'count')::int,1) else 0 end,
       months=>case when r->>'unit'='months' then coalesce((r->>'count')::int,1) when r->>'unit'='quarters' then 3*coalesce((r->>'count')::int,1) else 0 end,
       years=>case when r->>'unit'='years' then coalesce((r->>'count')::int,1) else 0 end))::date;
   -- A first reminder may be staggered; later reminders follow real completion dates.
   if last_date is null and r->>'first_due_date' is not null then due:=(r->>'first_due_date')::date;end if;
   n:=case when last_date is not null and p_today<due then 1 else 0 end;
   k:='interval:after:'||coalesce(last_date::text,'first');
  end if;
 elsif t='seasonal' then
   active:=extract(month from p_today)::integer=coalesce((r->>'month')::integer,0);
   s:=date_trunc('month',p_today)::date;e:=(s+interval '1 month -1 day')::date;k:='seasonal:'||s;due:=e;
 elsif t='seasonal_wildcard' then
   -- Meteorological seasons: winter is December through February, across years.
   s:=(date_trunc('quarter',p_today+interval '1 month')-interval '1 month')::date;
   e:=(s+interval '3 months -1 day')::date;k:='seasonal_wildcard:'||s;due:=e;
 else raise exception 'Unsupported recurrence type: %',t;
 end if;
 if t<>'interval' or r->>'anchor'='schedule' then
   select count(*) into n from public.quest_completions c join public.guilds g on g.id=c.guild_id
   where c.quest_id=p_q.id and c.reversed_at is null
     and ((p_q.owner_type not in ('individual','personal_daily') and coalesce(p_q.recurrence->>'completion_scope','household')<>'player') or coalesce(c.subject_user_id,c.completed_by)=p_uid)
     and case when t='interval' and r->>'anchor'='schedule' then
       -- The recorded occurrence owns the completion, even when done early.
       (c.occurrence_key=k or
        (coalesce(c.occurrence_key,'') not like 'interval:scheduled:%' and coalesce(c.effective_date,(c.completed_at at time zone g.timezone)::date) between s and e))
       and coalesce(c.effective_date,(c.completed_at at time zone g.timezone)::date)<=p_today
     else coalesce(c.effective_date,(c.completed_at at time zone g.timezone)::date) between s and e end;
 end if;
 if target>1 then k:=k||':step:'||least(target,n+1);end if;
 return jsonb_build_object('quest_id',p_q.id,'date',p_today,'occurrence_key',k,'complete',n>=target,'active',active,'count',n,'target',target,'due',due,'available',active and n<target and (t<>'interval' or r->>'anchor' is distinct from 'schedule' or p_today>=s),
   'slot',case when t='room_slots' then r->'slots'->least(target-1,n) else null end);
end $function$
;

-- Cleaning cadence follows actual completion; keep only the bedroom's initial stagger.
update public.quest_templates q
set recurrence=(q.recurrence-'start_date'-'first_due_date')||jsonb_build_object('anchor','last_completion')
  ||case when q.key='dust-the-bedroom' then jsonb_build_object('first_due_date','2026-10-24') else '{}'::jsonb end,
 updated_at=now()
from public.guilds g
where q.guild_id=g.id and g.slug='questbound-harris'
and q.key in ('dust-living-room','dust-the-bedroom')
and q.recurrence->>'type'='interval';
