create function public.ability_milestones_state()
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare gid uuid;lvl int;loot_level int;prestige_level int;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid();
 select min(n) into loot_level from generate_series(10,coalesce(lvl,1),5) n where not exists(select 1 from public.reward_events where guild_id=gid and event_key='ability-challenge:'||auth.uid()::text||':'||n::text);
 select min(n) into prestige_level from generate_series(100,coalesce(lvl,1),25) n where not exists(select 1 from public.reward_events where guild_id=gid and event_key='prestige:'||auth.uid()::text||':'||n::text);
 return jsonb_build_object('level',coalesce(lvl,1),'loot_find_level',loot_level,'prestige_level',prestige_level,
 'prestige_count',(select count(*) from public.reward_events where guild_id=gid and event_key like 'prestige:'||auth.uid()::text||':%'));
end $f$;
revoke all on function public.ability_milestones_state() from public,anon;grant execute on function public.ability_milestones_state() to authenticated;
create function public.claim_ability_milestone(p_ability text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare s jsonb;gid uuid;lvl int;milestone int;k text;d public.item_definitions;item uuid;bonus int:=0;xp int;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select guild_id into gid from public.guild_members where user_id=auth.uid() order by joined_at limit 1;
 if gid is null then raise exception 'Guild membership required';end if;
 select level into lvl from public.player_progress_public where guild_id=gid and user_id=auth.uid() for update;
 s:=public.ability_milestones_state();
 if p_ability='loot_find' then milestone:=(s->>'loot_find_level')::int;k:='ability-challenge:';
 elsif p_ability='prestige' then milestone:=(s->>'prestige_level')::int;k:='prestige:';bonus:=500;
 else raise exception 'Choose Loot Find or Prestige';end if;
 if milestone is null then raise exception 'No unclaimed milestone available';end if;
 k:=k||auth.uid()::text||':'||milestone::text;
 if p_ability='loot_find' then select * into d from public.item_definitions where key='gauntlet-token' and active and kind='challenge';
 else
  select * into d from public.item_definitions where active and kind='gear' and rarity in ('epic','legendary')
   order by -ln(greatest(random(),0.000001))/case when exists(select 1 from public.player_items where owner_user_id=auth.uid() and item_key=public.item_definitions.key) then .12 else 1 end limit 1;
 end if;
 if not found then raise exception 'Reward catalog unavailable';end if;
 insert into public.reward_events(guild_id,event_key,event_type,metadata) values(gid,k,'ability_milestone',jsonb_build_object('user_id',auth.uid(),'ability',p_ability,'level',milestone));
 insert into public.player_items(guild_id,owner_user_id,item_key,state,metadata,acquired_at)
 values(gid,auth.uid(),d.key,'unclaimed',jsonb_build_object('name',d.name,'icon',d.icon,'rarity',d.rarity,'kind',d.kind,'slot',d.slot,'description',d.description,'mechanics',d.mechanics,'ability',p_ability,'milestone',milestone),clock_timestamp()) returning id into item;
 update public.reward_events set metadata=metadata||jsonb_build_object('item_id',item,'personal_xp',bonus) where guild_id=gid and event_key=k;
 if bonus>0 then
  update public.player_progress_public set personal_xp=personal_xp+bonus,updated_at=now() where guild_id=gid and user_id=auth.uid() returning personal_xp into xp;
  update public.player_progress_public set level=public.qb_level_for_xp(xp),rank_key=public.qb_rank_for_level(public.qb_level_for_xp(xp)) where guild_id=gid and user_id=auth.uid();
 end if;
 insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,personal_xp,metadata)
 values(gid,auth.uid(),auth.uid(),'ability_milestone',case when p_ability='loot_find' then 'Loot Find: ' else 'Prestige: ' end||d.name,'private',bonus,jsonb_build_object('ability',p_ability,'level',milestone,'item_id',item));
 return jsonb_build_object('item_id',item,'item_name',d.name,'milestone',milestone,'personal_xp',bonus);
end $f$;
revoke all on function public.claim_ability_milestone(text) from public,anon;grant execute on function public.claim_ability_milestone(text) to authenticated;

