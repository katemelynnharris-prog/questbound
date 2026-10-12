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
  -- Successful drops include functioning, single-use uncommon items.
  if random()<.20 then
   select * into v_def from public.item_definitions where active and key in ('safe-passage','gauntlet-token') order by random() limit 1;
  end if;
  if v_def.key is null then
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
  end if;
  if v_def.key is null then
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
