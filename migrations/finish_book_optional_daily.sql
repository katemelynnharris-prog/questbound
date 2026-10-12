-- A book is an optional daily opportunity, not a permanent daily habit.
update public.quest_templates
set owner_type='shared',assignee_key=null,assigned_user_id=null,
    recurrence='{"type":"repeatable","completion_scope":"player"}'::jsonb,
    updated_at=now()
where key='finish-a-book' and active;
