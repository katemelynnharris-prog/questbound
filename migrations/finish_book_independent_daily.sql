-- Each guild member can finish a book once per day, independently.
-- Keep prior completion history and existing rewards/eligibility.
update public.quest_templates
set owner_type='personal_daily', assignee_key=null, assigned_user_id=null,
    recurrence=jsonb_build_object('type','daily'), updated_at=now()
where key='finish-a-book' and active;
