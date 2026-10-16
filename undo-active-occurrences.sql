-- Undone completions remain in the audit history but no longer occupy a live slot.
-- Build the replacement before dropping the old index, preserving active duplicate
-- protection throughout the transaction and retaining NULLS NOT DISTINCT semantics.
create unique index uq_quest_completion_active_occurrence
on public.quest_completions(quest_id,occurrence_key,subject_user_id)
nulls not distinct where reversed_at is null;
alter table public.quest_completions drop constraint uq_quest_completion_occurrence;
alter index public.uq_quest_completion_active_occurrence rename to uq_quest_completion_occurrence;
