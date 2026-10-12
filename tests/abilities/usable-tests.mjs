import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();for(const p of ['schema.sql','extra-schema.sql'])await db.exec(await fs.readFile(new URL(p,import.meta.url),'utf8'));
await db.exec(`create table public.player_loot_state(guild_id uuid,user_id uuid,pity_count int default 0,last_drop_at timestamptz,updated_at timestamptz,primary key(guild_id,user_id));create table public.reward_events(guild_id uuid,event_key text,event_type text,metadata jsonb,unique(guild_id,event_key));`);
await db.exec(await fs.readFile(new URL('varied-loot.sql',import.meta.url),'utf8'));await db.exec(await fs.readFile(new URL('usable-loot.sql',import.meta.url),'utf8'));
const g='10000000-0000-0000-0000-000000000001',u='20000000-0000-0000-0000-000000000001';await db.query('insert into guilds values($1)',[g]);await db.query("insert into guild_members(guild_id,user_id,player_key) values($1,$2,'Test')",[g,u]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);
await db.exec("insert into item_definitions(key,name,rarity,kind) values('safe-passage','Safe Passage','uncommon','consumable'),('gauntlet-token','Gauntlet Token','uncommon','challenge')");
await db.exec(`do $$declare g uuid:='${g}';u uuid:='${u}';c uuid;r jsonb;
begin
 for i in 1..600 loop
  c:=gen_random_uuid();insert into quest_completions(id,guild_id,completed_by) values(c,g,u);insert into quest_completion_rewards values(c,u,100,'{}');insert into player_loot_state(guild_id,user_id,pity_count) values(g,u,24) on conflict(guild_id,user_id) do update set pity_count=24;
  r:=qb_maybe_award_loot(g,u,'low',false,c);assert r is not null;
 end loop;
end $$;`);
const n=(await db.query("select count(*)::int n,count(*) filter(where item_key in ('safe-passage','gauntlet-token'))::int usable,count(distinct item_key) filter(where item_key in ('safe-passage','gauntlet-token'))::int types from player_items")).rows[0];assert.equal(n.n,600);assert.equal(n.types,2);assert.ok(n.usable>70&&n.usable<180);
console.log(`PASS gear and both functioning uncommon usable items in rotation: ${n.usable}/600 usable drops; pity-drop behavior preserved`);await db.close();
