CREATE OR REPLACE FUNCTION public.choose_specialization(p_specialization_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=auth.uid(); v_guild uuid; v_level integer; v_spent integer; v_earned integer; v_available integer;
  v_rank integer:=0; v_active integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_specialization_key not in ('Archivist','Vanguard','Pathfinder','Steward') then raise exception 'Unknown specialization'; end if;
  select guild_id into v_guild from public.guild_members where user_id=v_uid limit 1;
  if v_guild is null then raise exception 'Guild membership required'; end if;
  select coalesce(level,1) into v_level from public.player_progress_public where guild_id=v_guild and user_id=v_uid for update;
  if coalesce(v_level,1)<15 then raise exception 'Signet unlocks at level 15';end if;
  v_earned:=1+floor(v_level/10.0)::integer;
  select coalesce(sum(rank),0),count(*) filter(where rank>0) into v_spent,v_active from public.player_specializations where guild_id=v_guild and user_id=v_uid;
  select coalesce(rank,0) into v_rank from public.player_specializations where guild_id=v_guild and user_id=v_uid and specialization_key=p_specialization_key;
  if not found then v_rank:=0; end if;
  v_available:=v_earned-v_spent;
  if v_available<=0 then raise exception 'No Specialization Points available'; end if;
  if v_rank>=2 then raise exception 'Maximum rank reached'; end if;
  if v_rank=0 and v_active>=3 then raise exception 'Maximum 3 active specializations'; end if;
  insert into public.player_specializations(guild_id,user_id,specialization_key,rank)
  values(v_guild,v_uid,p_specialization_key,1)
  on conflict(guild_id,user_id,specialization_key) do update set rank=public.player_specializations.rank+1,updated_at=now()
  returning rank into v_rank;
  insert into public.activity_events(guild_id,actor_user_id,target_user_id,event_type,message,visibility,metadata)
  values(v_guild,v_uid,v_uid,'specialization','Deepened specialization: '||p_specialization_key,'private',jsonb_build_object('specialization',p_specialization_key,'rank',v_rank));
  return jsonb_build_object('specialization',p_specialization_key,'rank',v_rank,'points_remaining',v_available-1);
end; $function$;

