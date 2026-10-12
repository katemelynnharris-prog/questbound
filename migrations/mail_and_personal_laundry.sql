update public.quest_templates q set recurrence=q.recurrence||'{"completion_scope":"player","daily_ledger":false}'::jsonb,updated_at=now()
from public.guilds g where q.guild_id=g.id and g.slug='questbound-harris' and q.key='fold-laundry';
insert into public.quest_templates(guild_id,key,title,objective,category,owner_type,value_tier,xp_personal,xp_campaign,random_eligible,gauntlet_eligible,recurrence,visibility)
select g.id,'check-the-mail','Check the mail','Collect the mail and bring it inside.','Tasks','shared','Low',20,5,true,true,'{"type":"repeatable","daily_ledger":false}'::jsonb,'guild'
from public.guilds g where g.slug='questbound-harris'
on conflict(guild_id,key) do nothing;
