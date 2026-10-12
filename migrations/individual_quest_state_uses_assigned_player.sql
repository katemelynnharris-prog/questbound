-- Individual quest state follows the assigned player, regardless of viewer.
-- Personal daily quests continue to use the signed-in player's completion.
CREATE OR REPLACE FUNCTION public.quest_recurrence_states()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select coalesce(jsonb_agg(game_private.quest_cycle(
   q,
   case when q.owner_type = 'individual' then
     coalesce(q.assigned_user_id,
       (select gm.user_id from public.guild_members gm
        where gm.guild_id = q.guild_id
          and lower(gm.player_key) = lower(q.assignee_key)
        order by gm.joined_at, gm.user_id limit 1),
       auth.uid())
   else auth.uid() end,
   public.qb_effective_date(q.guild_id)
 )), '[]'::jsonb)
 into result
 from public.quest_templates q
 where q.active and public.can_view_quest(q.id);
 return result;
end $function$;
