import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();for(const p of ['schema.sql','extra-schema.sql'])await db.exec(await fs.readFile(new URL(p,import.meta.url),'utf8'));
await db.exec(`create table public.player_loot_state(guild_id uuid,user_id uuid,pity_count int default 0,last_drop_at timestamptz,updated_at timestamptz,primary key(guild_id,user_id));create table public.reward_events(guild_id uuid,event_key text,event_type text,metadata jsonb,unique(guild_id,event_key));`);
await db.exec(await fs.readFile(new URL('varied-loot.sql',import.meta.url),'utf8'));
const g='10000000-0000-0000-0000-000000000001',a='20000000-0000-0000-0000-000000000001';await db.query('insert into guilds values($1)',[g]);await db.query("insert into guild_members(guild_id,user_id,player_key) values($1,$2,'Kate')",[g,a]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
await db.query("insert into item_definitions(key,name,rarity,kind) values('trail-leggings','Trail Leggings','common','gear')");
assert.equal((await db.query("select count(*)::int n from item_definitions where rarity='common'")).rows[0].n,14);assert.equal((await db.query('select count(distinct slot)::int n from item_definitions where slot is not null')).rows[0].n,9);
await db.query('insert into player_loot_state(guild_id,user_id,pity_count) values($1,$2,24)',[g,a]);
const repeat=(await db.query(`do $$declare g uuid:='${g}';u uuid:='${a}';c uuid;r jsonb;last text;n int:=0;
begin
 for i in 1..1000 loop
  delete from public.player_items;
  insert into public.player_items(guild_id,owner_user_id,item_key,state,acquired_at) values(g,u,'trail-leggings','discarded',now()-interval '2 days'),(g,u,'work-gloves','pack',now()-interval '1 day'),(g,u,'travelers-tunic','equipped',now());
  c:=gen_random_uuid();insert into quest_completions(id,guild_id,completed_by) values(c,g,u);insert into quest_completion_rewards values(c,u,100,'{}');
  update player_loot_state set pity_count=24;
  r:=public.qb_maybe_award_loot(g,u,'low',false,c);
  assert r->>'item_key'<>'travelers-tunic','Back-to-back duplicate';
  if r->>'item_key' in ('trail-leggings','work-gloves') then n:=n+1;end if;
 end loop;
 perform set_config('stage.repeat_count',n::text,false);
end $$;`)).rows;
const repeats=Number((await db.query("select current_setting('stage.repeat_count') n")).rows[0].n);assert.ok(repeats>0&&repeats<60,'Repeats remain possible but uncommon among a small collection');
await db.exec(`do $$declare g uuid:='${g}';u uuid:='${a}';c uuid;r jsonb;last text;
begin
 for i in 1..80 loop
  select item_key into last from player_items where owner_user_id=u order by acquired_at desc,id desc limit 1;
  c:=gen_random_uuid();insert into quest_completions(id,guild_id,completed_by) values(c,g,u);insert into quest_completion_rewards values(c,u,100,'{}');update player_loot_state set pity_count=24;
  r:=public.qb_maybe_award_loot(g,u,'low',false,c);assert r is not null;assert r->>'item_key' is distinct from last;
 end loop;
end $$;`);
console.log(`PASS 14 common items / 9 slots; repeat rate ${repeats}/1000 for small collection; no consecutive identical drops; drops continue after collecting pool`);await db.close();
