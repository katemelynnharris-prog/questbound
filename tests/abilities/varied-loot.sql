insert into public.item_definitions(key,name,icon,rarity,kind,slot,description,mechanics,transferable,active) values
('watchkeepers-cap','Watchkeeper’s Cap','🪖','common','gear','head','A sturdy cap for the road.','{"defense":1}',true,true),
('leather-coif','Leather Coif','🪖','common','gear','head','Supple leather with a reinforced brow.','{"defense":2}',true,true),
('travelers-tunic','Traveler’s Tunic','🧥','common','gear','chest','A comfortable tunic with close-woven cloth.','{"defense":2}',true,true),
('padded-vest','Padded Vest','🧥','common','gear','chest','Quilted padding for everyday adventures.','{"defense":2}',true,true),
('work-gloves','Work Gloves','🧤','common','gear','hands','Good grip for honest work.','{"defense":1}',true,true),
('training-wraps','Training Wraps','🧤','common','gear','hands','Simple wraps for a focused training session.','{"training_xp_pct":2}',true,true),
('sturdy-trousers','Sturdy Trousers','👖','common','gear','legs','Hard-wearing trousers with reinforced seams.','{"defense":2}',true,true),
('roadwalkers-boots','Roadwalker’s Boots','🥾','common','gear','feet','Broken-in boots ready for another mile.','{"defense":1}',true,true),
('soft-leather-boots','Soft Leather Boots','🥾','common','gear','feet','Light footwear for wandering off the usual road.','{"exploration_xp_pct":2}',true,true),
('practice-sword','Practice Sword','⚔️','common','gear','main_hand','A blunt blade for learning the basics.','{"defense":1}',true,true),
('oaken-buckler','Oaken Buckler','🛡️','common','gear','off_hand','A small wooden shield with a stout leather strap.','{"defense":2}',true,true),
('lucky-pebble','Lucky Pebble','🪨','common','gear','charm','A smooth river stone kept for good luck.','{"fortune":1}',true,true),
('travelers-token','Traveler’s Token','🪙','common','gear','relic2','A keepsake from the first road out of home.','{"defense":1}',true,true) on conflict(key) do nothing;
CREATE OR REPLACE FUNCTION public.qb_maybe_award_loot(p_guild uuid, p_user uuid, p_tier text, p_major boolean, p_completion uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_state public.player_loot_state%rowtype; v_chance numeric; v_roll numeric; v_def public.item_definitions%rowtype; v_item uuid; v_tier text:=lower(coalesce(p_tier,'medium')); v_allowed text[];
begin
  if auth.uid() is null or not public.is_guild_member(p_guild) or not exists(
   select 1 from public.quest_completions c join public.quest_completion_rewards r on r.completion_id=c.id
    where c.id=p_completion and c.guild_id=p_guild and c.completed_by=auth.uid() and c.reversed_at is null and r.user_id=p_user
  ) then raise exception 'Authorized quest reward required';end if;
  if exists(select 1 from public.reward_events where guild_id=p_guild and event_key='quest-loot:'||p_completion::text||':'||p_user::text) then return null;end if;
  insert into public.player_loot_state(guild_id,user_id) values(p_guild,p_user) on conflict(guild_id,user_id) do nothing;
  select * into v_state from public.player_loot_state where guild_id=p_guild and user_id=p_user for update;
  v_chance:=case v_tier when 'low' then .015 when 'high' then .05 else .025 end;
  if coalesce(p_major,false) then v_chance:=greatest(v_chance,.15); end if;
  if v_state.pity_count>=15 then v_chance:=least(.40,v_chance+(v_state.pity_count-14)*.01); end if;
  v_roll:=random();
  if v_state.pity_count<24 and v_roll>=v_chance then
    update public.player_loot_state set pity_count=pity_count+1,updated_at=now() where guild_id=p_guild and user_id=p_user;
    return null;
  end if;
  if coalesce(p_major,false) then v_allowed:=array['rare','epic'];
  elsif v_tier='high' then v_allowed:=array['uncommon','rare','epic'];
  elsif v_tier='low' then v_allowed:=array['common','uncommon'];
  else v_allowed:=array['common','uncommon','rare']; end if;
  -- Any gear is usable by either character. Repeats stay possible at reduced weight.
  select d.* into v_def from public.item_definitions d
   where d.active and d.kind='gear' and d.rarity=any(v_allowed)
    and (d.key is distinct from (select item_key from public.player_items where owner_user_id=p_user order by acquired_at desc,id desc limit 1)
     or not exists(select 1 from public.item_definitions alt where alt.active and alt.kind='gear' and alt.rarity=any(v_allowed) and alt.key<>d.key))
   order by -ln(greatest(random(),0.000001))/case when exists(select 1 from public.player_items pi where pi.owner_user_id=p_user and pi.item_key=d.key) then .12 else 1 end limit 1;
  if not found then
    select d.* into v_def from public.item_definitions d where d.active and d.kind='gear'
     order by -ln(greatest(random(),0.000001))/case when exists(select 1 from public.player_items pi where pi.owner_user_id=p_user and pi.item_key=d.key) then .12 else 1 end limit 1;
  end if;
  if not found then
    update public.player_loot_state set pity_count=pity_count+1,updated_at=now() where guild_id=p_guild and user_id=p_user;
    return null;
  end if;
  insert into public.player_items(guild_id,owner_user_id,item_key,state,metadata,acquired_at)
  values(p_guild,p_user,v_def.key,'unclaimed',jsonb_build_object('name',v_def.name,'icon',v_def.icon,'rarity',v_def.rarity,'kind',v_def.kind,'slot',v_def.slot,'description',v_def.description,'mechanics',v_def.mechanics,'natural_loot',true,'completion_id',p_completion),clock_timestamp()) returning id into v_item;
  update public.player_loot_state set pity_count=0,last_drop_at=now(),updated_at=now() where guild_id=p_guild and user_id=p_user;
  insert into public.reward_events(guild_id,event_key,event_type,metadata)
  values(p_guild,'quest-loot:'||p_completion::text||':'||p_user::text,'quest_loot',jsonb_build_object('completion_id',p_completion,'user_id',p_user,'item_id',v_item,'item_key',v_def.key,'rarity',v_def.rarity));
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
  values(p_guild,p_user,p_user,'loot_drop','Loot found: '||v_def.name,'private',jsonb_build_object('completion_id',p_completion,'item_id',v_item,'item_key',v_def.key,'rarity',v_def.rarity,'natural_loot',true));
  return jsonb_build_object('item_id',v_item,'item_key',v_def.key,'item_name',v_def.name,'rarity',v_def.rarity);
end $function$;
revoke all on function public.qb_maybe_award_loot(uuid,uuid,text,boolean,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.qb_level_up_reward_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_milestone integer; v_key text; v_def public.item_definitions%rowtype; v_item uuid;
begin
  if new.level is null or old.level is null or new.level<=old.level then return new; end if;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
  values(new.guild_id,new.user_id,new.user_id,'level_up','Reached Level '||new.level,'guild',jsonb_build_object('old_level',old.level,'new_level',new.level));
  v_milestone := (new.level/5)*5;
  if v_milestone>=5 and v_milestone>old.level then
    v_key:='level-loot:'||new.user_id::text||':'||v_milestone::text;
    begin
      insert into public.reward_events(guild_id,event_key,event_type,metadata) values(new.guild_id,v_key,'level_loot',jsonb_build_object('user_id',new.user_id,'level',v_milestone));
    exception when unique_violation then return new; end;
    select d.* into v_def from public.item_definitions d where d.active and d.kind='gear'
     and (d.key is distinct from(select item_key from public.player_items where owner_user_id=new.user_id order by acquired_at desc,id desc limit 1)
      or not exists(select 1 from public.item_definitions alt where alt.active and alt.kind='gear' and alt.key<>d.key))
     order by -ln(greatest(random(),0.000001))/(case d.rarity when 'common' then 6 when 'uncommon' then 4 when 'rare' then 2 when 'epic' then 1 else .25 end
      *case when exists(select 1 from public.player_items pi where pi.owner_user_id=new.user_id and pi.item_key=d.key) then .12 else 1 end) limit 1;
    if found then
      insert into public.player_items(guild_id,owner_user_id,item_key,state,metadata,acquired_at)
      values(new.guild_id,new.user_id,v_def.key,'unclaimed',jsonb_build_object('name',v_def.name,'icon',v_def.icon,'rarity',v_def.rarity,'kind',v_def.kind,'slot',v_def.slot,'description',v_def.description,'mechanics',v_def.mechanics,'level_reward',v_milestone),clock_timestamp()) returning id into v_item;
      update public.reward_events set metadata=metadata||jsonb_build_object('item_id',v_item,'item_key',v_def.key,'item_name',v_def.name,'rarity',v_def.rarity) where guild_id=new.guild_id and event_key=v_key;
      insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
      values(new.guild_id,new.user_id,new.user_id,'loot_drop','Milestone cache: '||v_def.name,'guild',jsonb_build_object('item_id',v_item,'level',v_milestone,'rarity',v_def.rarity));
    end if;
  end if;
  return new;
end;$function$;

