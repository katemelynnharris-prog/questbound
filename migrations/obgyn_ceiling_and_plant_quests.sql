insert into public.quest_templates(guild_id,key,title,objective,category,owner_type,assignee_key,assigned_user_id,value_tier,xp_personal,xp_campaign,random_eligible,gauntlet_eligible,recurrence,visibility)
select g.id,v.key,v.title,v.objective,'Tasks',v.owner_type,
 case when v.owner_type='individual' then 'Kate' else null end,
 case when v.owner_type='individual' then (select user_id from public.guild_members where guild_id=g.id and lower(player_key)='kate' order by joined_at limit 1) else null end,
 'Low',40,10,true,true,v.recurrence,'guild'
from public.guilds g cross join(values
 ('call-obgyn','Call OBGYN','Call the OBGYN office.','individual','{"type":"once","daily_ledger":false}'::jsonb),
 ('vacuum-ceiling-fan-blades','Vacuum ceiling fan blades','Remove dust from the ceiling fan blades.','shared','{"type":"frequency","period":"month","target":1,"daily_ledger":false}'::jsonb),
 ('vacuum-crown-molding-ceiling-corners','Vacuum crown molding/ceiling corners','Remove dust and cobwebs from crown molding and ceiling corners.','shared','{"type":"frequency","period":"month","target":1,"daily_ledger":false}'::jsonb),
 ('get-mums-front-porch','Get mums for front porch','Get mums for the front porch.','shared','{"type":"once","daily_ledger":false}'::jsonb),
 ('repot-plants','Repot plants','Repot the plants that need it.','shared','{"type":"once","daily_ledger":false}'::jsonb)
) v(key,title,objective,owner_type,recurrence)
where g.slug='questbound-harris'
on conflict(guild_id,key) do nothing;
