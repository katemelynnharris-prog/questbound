-- Maintenance chores recur from their latest non-reversed completion.
-- Preserve their existing first reminder when they have never been completed.
-- Calendar events, bills, dates, trips, and weekly routines retain their schedules.
begin;
with cadence(key,unit,n) as (values
 ('clean-windows','months',3),
 ('dust-blinds','months',1),
 ('dust-window-sills','days',15),
 ('oil-change','months',3),
 ('oil-change-car-2','months',3),
 ('purge-mail-basket','months',1),
 ('vacuum-ceiling-fan-blades','months',1),
 ('vacuum-crown-molding-ceiling-corners','months',1),
 ('wash-couch-covers','months',6)
)
update public.quest_templates q
set recurrence=(q.recurrence-'type'-'period'-'target')
 ||jsonb_build_object('type','interval','unit',c.unit,'count',c.n,'anchor','last_completion',
 'first_due_date',game_private.quest_cycle(q,null,(now() at time zone g.timezone)::date)->>'due'),
 updated_at=now()
from cadence c,public.guilds g
where q.guild_id=g.id and g.slug='questbound-harris' and q.key=c.key
 and q.recurrence->>'type'='frequency';
commit;