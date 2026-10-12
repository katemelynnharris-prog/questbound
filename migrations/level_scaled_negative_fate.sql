-- Negative daily Fate: 5% before the whole guild reaches level 10, then 15%.
create or replace function game_private.fate_negative_chance(p_party_level integer)
returns integer language sql immutable security invoker set search_path='' as $$
  select case when coalesce(p_party_level,1)>=10 then 15 else 5 end;
$$;
revoke all on function game_private.fate_negative_chance(integer) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.ensure_home_cycles()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_gid uuid;
  v_tz text;
  v_today date;
  v_week date;
  v_fate_idx integer;
  v_party_level integer;
  v_negative_pct integer;
  v_weekly_idx integer;
  v_fate_key text;
  v_fate_name text;
  v_fate_text text;
  v_weekly_key text;
  v_weekly_title text;
  v_weekly_desc text;
  v_weekly_cat text;
  v_weekly_target numeric;
  v_weekly_unit text;
  v_weekly_reward integer;
  v_weekly_day_based boolean := false;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select gm.guild_id, g.timezone
  into v_gid, v_tz
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  where gm.user_id = v_uid
  order by gm.joined_at
  limit 1;

  if v_gid is null then raise exception 'Guild membership required'; end if;

  v_today := public.qb_effective_date(v_gid);
  v_week := v_today - (extract(isodow from v_today)::integer - 1);

  v_fate_idx := (abs(hashtextextended(v_gid::text || ':' || v_today::text, 11)) % 7)::integer;
  -- Shared Fate scales only after the lowest-level guild member reaches level 10.
  select coalesce(min(coalesce(p.level,1)),1) into v_party_level
  from public.guild_members gm
  left join public.player_progress_public p on p.guild_id=gm.guild_id and p.user_id=gm.user_id
  where gm.guild_id=v_gid;
  v_negative_pct:=game_private.fate_negative_chance(v_party_level);
  if mod(abs(hashtextextended(v_gid::text || ':' || v_today::text, 83)::numeric),100)<v_negative_pct then
    v_fate_idx:=-1;
  end if;
  case v_fate_idx
    when -1 then v_fate_key:='roughroads'; v_fate_name:='Rough Roads'; v_fate_text:='Quest Personal XP is reduced by 25%. Each Defense point reduces the penalty by 1 percentage point (minimum 5%). Ward gives a chance to block it entirely (maximum 75%). Campaign XP is unaffected.';
    when 0 then v_fate_key := 'bold'; v_fate_name := 'Fortune Favors the Bold'; v_fate_text := 'The first featured Random Sidequest you complete today earns +50% personal XP instead of +20%.';
    when 1 then v_fate_key := 'company'; v_fate_name := 'Company of Two'; v_fate_text := 'Co-op quests earn +50% personal XP today.';
    when 2 then v_fate_key := 'fortune'; v_fate_name := 'Fortune Smiles'; v_fate_text := 'Every completed quest earns +15 personal XP today.';
    when 3 then v_fate_key := 'homefront'; v_fate_name := 'Homefront'; v_fate_text := 'Home, Tasks, Homestead, and Garage quests earn +35% personal XP today.';
    when 4 then v_fate_key := 'longroad'; v_fate_name := 'Long Road'; v_fate_text := 'Your first completed quest today earns +25 Campaign XP.';
    when 5 then v_fate_key := 'mischief'; v_fate_name := 'Mischief'; v_fate_text := 'Featured Random Sidequests earn +30% personal XP today instead of +20%.';
    else v_fate_key := 'quiet'; v_fate_name := 'Quiet Roads'; v_fate_text := 'No modifier today. The road itself is enough.';
  end case;

  insert into public.fate_days(guild_id,fate_date,fate_key,state)
  values(v_gid,v_today,v_fate_key,jsonb_build_object('name',v_fate_name,'text',v_fate_text,'negative',v_fate_key='roughroads','negative_roll_chance_pct',v_negative_pct))
  on conflict(guild_id,fate_date) do nothing;

  v_weekly_idx := (abs(hashtextextended(v_gid::text || ':' || v_week::text, 29)) % 12)::integer;
  case v_weekly_idx
    when 0 then v_weekly_key:='noeatout'; v_weekly_title:='Full Week — No Eating Out'; v_weekly_cat:='Finance'; v_weekly_desc:='Complete seven days without restaurant or takeout meals.'; v_weekly_target:=7; v_weekly_unit:='days'; v_weekly_reward:=400; v_weekly_day_based:=true;
    when 1 then v_weekly_key:='longpatrol'; v_weekly_title:='The Long Patrol'; v_weekly_cat:='Fitness'; v_weekly_desc:='Accumulate 10 intentional walking or hiking miles together.'; v_weekly_target:=10; v_weekly_unit:='miles'; v_weekly_reward:=425;
    when 2 then v_weekly_key:='keep'; v_weekly_title:='Clear the Keep'; v_weekly_cat:='Home'; v_weekly_desc:='Complete 5 household quests between you.'; v_weekly_target:=5; v_weekly_unit:='quests'; v_weekly_reward:=400;
    when 3 then v_weekly_key:='ledger'; v_weekly_title:='Empty the Ledger'; v_weekly_cat:='Admin'; v_weekly_desc:='Each complete 3 lingering admin quests this week.'; v_weekly_target:=6; v_weekly_unit:='quests'; v_weekly_reward:=450;
    when 4 then v_weekly_key:='table'; v_weekly_title:='At the Table'; v_weekly_cat:='Connection'; v_weekly_desc:='Eat dinner together at home 5 times this week.'; v_weekly_target:=5; v_weekly_unit:='dinners'; v_weekly_reward:=400;
    when 5 then v_weekly_key:='fellowship'; v_weekly_title:='The Fellowship'; v_weekly_cat:='Connection'; v_weekly_desc:='Together make 4 intentional friend or family connections.'; v_weekly_target:=4; v_weekly_unit:='connections'; v_weekly_reward:=375;
    when 6 then v_weekly_key:='purge'; v_weekly_title:='The Purge'; v_weekly_cat:='Home'; v_weekly_desc:='Donate, sell, recycle, or discard 20 unwanted items.'; v_weekly_target:=20; v_weekly_unit:='items'; v_weekly_reward:=425;
    when 7 then v_weekly_key:='unfinished'; v_weekly_title:='Unfinished Business'; v_weekly_cat:='Projects'; v_weekly_desc:='Choose one lingering shared project and finish it before Sunday.'; v_weekly_target:=1; v_weekly_unit:='project'; v_weekly_reward:=500;
    when 8 then v_weekly_key:='scholar'; v_weekly_title:='The Scholars'' Pact'; v_weekly_cat:='Growth'; v_weekly_desc:='Accumulate 4 combined hours of deliberate study or learning.'; v_weekly_target:=4; v_weekly_unit:='hours'; v_weekly_reward:=425;
    when 9 then v_weekly_key:='iron'; v_weekly_title:='The Iron Week'; v_weekly_cat:='Fitness'; v_weekly_desc:='Complete 6 intentional training or activity sessions between you.'; v_weekly_target:=6; v_weekly_unit:='sessions'; v_weekly_reward:=475;
    when 10 then v_weekly_key:='hoard'; v_weekly_title:='The Hoarder''s Oath'; v_weekly_cat:='Finance'; v_weekly_desc:='Add to the Treasury goal and make no unplanned withdrawals for seven days.'; v_weekly_target:=7; v_weekly_unit:='days'; v_weekly_reward:=500; v_weekly_day_based:=true;
    else v_weekly_key:='sabbath'; v_weekly_title:='The Sabbath'; v_weekly_cat:='Rest'; v_weekly_desc:='Protect one meaningful block of time for rest together—no productivity required.'; v_weekly_target:=1; v_weekly_unit:='rest block'; v_weekly_reward:=350;
  end case;

  insert into public.weekly_challenges(guild_id,week_key,challenge_key,title,target,progress,unit,metadata)
  values(v_gid,v_week,v_weekly_key,v_weekly_title,v_weekly_target,0,v_weekly_unit,
    jsonb_build_object('description',v_weekly_desc,'category',v_weekly_cat,'reward_campaign_xp',v_weekly_reward,'day_based',v_weekly_day_based))
  on conflict(guild_id,week_key) do nothing;

  insert into public.road_march_weeks(guild_id,week_key,goal_steps,total_steps,milestone_state,metadata)
  values(v_gid,v_week,100000,0,'{"25":false,"50":false,"75":false,"100":false}'::jsonb,
    jsonb_build_object('title','Weekly Road March','source','manual_until_healthkit'))
  on conflict(guild_id,week_key) do nothing;

  update public.campaigns
  set chapter_key = case
    when campaign_xp >= goal_xp then 'burden-ends'
    when campaign_xp * 100.0 / nullif(goal_xp,0) >= 80 then 'burning-mountain'
    when campaign_xp * 100.0 / nullif(goal_xp,0) >= 60 then 'beneath-mountain'
    when campaign_xp * 100.0 / nullif(goal_xp,0) >= 40 then 'crossroads'
    when campaign_xp * 100.0 / nullif(goal_xp,0) >= 20 then 'prancing-lantern'
    else 'road-from-home' end
  where guild_id=v_gid and status in ('active','victory');

  return jsonb_build_object('guild_id',v_gid,'today',v_today,'week_key',v_week);
end;
$function$
;