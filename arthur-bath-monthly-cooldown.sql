-- Arthur's bath is one household completion, with a monthly game cooldown.
update public.quest_templates q
set recurrence=q.recurrence||'{"type":"interval","unit":"months","count":1,"anchor":"last_completion","completion_scope":"household"}'::jsonb,
updated_at=now()
from public.guilds g
where q.guild_id=g.id and g.slug='questbound-harris' and q.key='bathe-arthur';