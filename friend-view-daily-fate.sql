CREATE OR REPLACE FUNCTION public.questbound_friend_feed()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '3s'
AS $function$
with g as (
 select x.id from public.guilds x join public.questbound_showcase_settings s on s.guild_id=x.id
 where x.slug='questbound-harris' and s.enabled
), members as (
 select m.guild_id,m.user_id,case lower(m.player_key) when 'kate' then 'Kate' else 'Drew' end as name
 from public.guild_members m join g on g.id=m.guild_id where lower(m.player_key) in ('kate','drew')
), allowed_quests(key,title,category) as (values
 ('walk-arthur','Walk Arthur','Companion'),
 ('long-dog-walk','Take Arthur on a long walk','Companion'),
 ('take-arthur-somewhere-fun','Take Arthur somewhere fun','Companion'),
 ('bathe-arthur','Bathe Arthur','Companion'),
 ('read-a-book-for-pleasure','Read a book for pleasure','Knowledge'),
 ('finish-a-book','Finish a book','Knowledge'),
 ('listen-to-fifteen-minutes-of-an-audiobook','Listen to an audiobook for fifteen minutes','Knowledge'),
 ('duolingo','Duolingo','Knowledge'),
 ('study-learn','Study / Learn','Knowledge'),
 ('submit-audio-audition','Submit an audio audition','Projects'),
 ('complete-freelance-project','Complete a freelance project','Projects'),
 ('make-bread','Make bread','Home'),
 ('cook-a-new-meal','Cook a new meal','Home'),
 ('fold-laundry','Fold laundry','Home'),
 ('load-unload-dishwasher','Load/unload dishwasher','Home'),
 ('clean-one-bathroom','Clean one bathroom','Home'),
 ('dust-living-room','Dust living room','Home'),
 ('dust-the-bedroom','Dust the bedroom','Home'),
 ('dust-window-sills','Dust window sills','Home'),
 ('dust-blinds','Dust blinds','Home'),
 ('vacuum-ceiling-fan-blades','Vacuum ceiling fan blades','Home'),
 ('vacuum-crown-molding-ceiling-corners','Vacuum crown molding/ceiling corners','Home'),
 ('vacuum-upstairs','Vacuum upstairs','Home'),
 ('vacuum-mop-downstairs','Vacuum/mop downstairs','Home'),
 ('check-the-mail','Check the mail','Home'),
 ('repot-plants','Repot plants','Home'),
 ('30-minute-home-reset','30 minute home reset','Home'),
 ('play-board-or-card-game','Play a board game or card game','Together'),
 ('read-out-loud','Read out loud','Together'),
 ('go-to-movie','Go to a movie','Exploration'),
 ('attend-concert','Attend a concert','Exploration'),
 ('attend-symphony','Attend the symphony','Exploration'),
 ('see-theater-production','See a theater production','Exploration')
), quests as (
 select q.id,a.key,a.title,a.category,q.owner_type,q.recurrence,q.xp_personal,q.xp_campaign,
  (select jsonb_object_agg(m.name,jsonb_build_object(
    'complete',(c.value->>'complete')::boolean,'available',(c.value->>'available')::boolean,
    'count',(c.value->>'count')::int,'target',(c.value->>'target')::int))
   from members m cross join lateral (select game_private.quest_cycle(q,m.user_id,public.qb_effective_date(q.guild_id)) as value) c
  ) as progress
 from public.quest_templates q join g on g.id=q.guild_id join allowed_quests a on a.key=q.key
 where q.active and not q.hidden_encounter and q.visibility='guild'
 and q.owner_type in ('shared','co-op','personal_daily')
), activity as (
 select e.created_at,m.name as actor,
 case e.event_type
  when 'quest_complete' then 'Completed '||a.title
  when 'treasury' then 'Updated the Guild Vault'
  when 'training_complete' then 'Completed a training quest'
  when 'level_up' then 'Reached a new level'
 end as text
 from public.activity_events e join g on g.id=e.guild_id left join members m on m.user_id=e.actor_user_id
 left join quests a on e.metadata->>'quest_id'=a.id::text
 where e.visibility='guild' and
 (e.event_type in ('treasury','training_complete','level_up') or (e.event_type='quest_complete' and a.id is not null))
 order by e.created_at desc limit 25
)
select case when not exists(select 1 from g) then jsonb_build_object('available',false)
else jsonb_build_object(
 'available',true,'updated_at',now(),'guild','Questbound',
 'players',coalesce((select jsonb_agg(jsonb_build_object(
  'name',m.name,'path',case m.name when 'Kate' then 'Rider' else 'Witcher' end,
  'level',p.level,'rank',p.rank_key,'xp',p.personal_xp,
  'defense',p.defense,'ward',p.ward,'fortune',p.fortune,
  'specializations',coalesce((select jsonb_agg(jsonb_build_object('name',s.specialization_key,'rank',s.rank) order by s.specialization_key)
    from public.player_specializations s where s.guild_id=m.guild_id and s.user_id=m.user_id and s.rank>0),'[]'::jsonb),
  'gear',coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'rarity',d.rarity,'slot',i.equipped_slot,'description',d.description,'bonuses',jsonb_strip_nulls(jsonb_build_object('defense',case when jsonb_typeof(d.mechanics->'defense')='number' then d.mechanics->'defense' end,'ward_pct',case when jsonb_typeof(d.mechanics->'ward_pct')='number' then d.mechanics->'ward_pct' end,'fortune',case when jsonb_typeof(d.mechanics->'fortune')='number' then d.mechanics->'fortune' end,'training_xp_pct',case when jsonb_typeof(d.mechanics->'training_xp_pct')='number' then d.mechanics->'training_xp_pct' end,'exploration_xp_pct',case when jsonb_typeof(d.mechanics->'exploration_xp_pct')='number' then d.mechanics->'exploration_xp_pct' end,'third_expedition_renown',case when jsonb_typeof(d.mechanics->'third_expedition_renown')='number' then d.mechanics->'third_expedition_renown' end,'gauntlet_xp_pct',case when jsonb_typeof(d.mechanics->'gauntlet_xp_pct')='number' then d.mechanics->'gauntlet_xp_pct' end,'witcher_trial_xp_pct',case when jsonb_typeof(d.mechanics->'witcher_trial_xp_pct')='number' then d.mechanics->'witcher_trial_xp_pct' end,'featured_xp_pct',case when jsonb_typeof(d.mechanics->'featured_xp_pct')='number' then d.mechanics->'featured_xp_pct' end,'shared_xp_pct',case when jsonb_typeof(d.mechanics->'shared_xp_pct')='number' then d.mechanics->'shared_xp_pct' end,'category_xp_pct',(select jsonb_object_agg(x.key,x.value) from jsonb_each(case when jsonb_typeof(d.mechanics->'category_xp_pct')='object' then d.mechanics->'category_xp_pct' else '{}'::jsonb end) x where x.key in ('Home','Tasks','Garage','Knowledge','Health','Exploration','Companion','Projects','Social','Habits','Marriage','Seasonal','Spiritual') and jsonb_typeof(x.value)='number')))) order by i.equipped_slot)
    from public.player_items i join public.item_definitions d on d.key=i.item_key
    where i.guild_id=m.guild_id and i.owner_user_id=m.user_id and i.state='equipped' and d.kind='gear'),'[]'::jsonb)
 ) order by m.name desc) from members m join public.player_progress_public p on p.guild_id=m.guild_id and p.user_id=m.user_id),'[]'::jsonb),
 'campaign',(select jsonb_build_object('name',c.name,'xp',c.campaign_xp,'goal',c.goal_xp,'chapter',c.chapter_key,'status',c.status)
    from public.campaigns c join g on g.id=c.guild_id where c.status in ('active','victory') order by c.started_at desc limit 1),
 'fate',(select jsonb_build_object('date',f.fate_date,'key',f.fate_key,'name',f.state->>'name','text',f.state->>'text')
    from public.fate_days f join g on g.id=f.guild_id where f.fate_date=public.qb_effective_date(g.id)),
 'vault',(select jsonb_build_object('progress',least(100,greatest(0,floor(t.balance/nullif(t.target_amount,0)*20)*5)))
    from public.treasury_funds t join g on g.id=t.guild_id where t.status='active' order by t.created_at desc limit 1),
 'quests',coalesce((select jsonb_agg(jsonb_build_object('key',q.key,'title',q.title,'category',q.category,
   'ownership',case when q.owner_type='co-op' then 'Together · both earn XP'
     when q.owner_type='personal_daily' or q.recurrence->>'completion_scope'='player' then 'Each player separately' else 'Household · completer XP' end,
   'repeat',case q.recurrence->>'type' when 'daily' then 'Daily reset' when 'repeatable' then 'Daily reset'
      when 'weekly' then 'Weekly' when 'interval' then 'Every '||(q.recurrence->>'count')||' '||(q.recurrence->>'unit')
      when 'frequency' then (q.recurrence->>'target')||' per '||(q.recurrence->>'period') when 'room_slots' then 'Weekly · room objectives' else 'One time' end,
   'xp',q.xp_personal,'campaign_xp',q.xp_campaign,'progress',q.progress) order by q.category,q.title) from quests q),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(jsonb_build_object('at',a.created_at,'actor',coalesce(a.actor,'Guild'),'text',a.text) order by a.created_at desc) from activity a),'[]'::jsonb)
) end;
$function$
;
