import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();for(const p of ['schema.sql','config.sql','quest-perks.sql','legendary.sql'])await db.exec(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const g='10000000-0000-0000-0000-000000000001';await db.query('insert into guilds values($1)',[g]);
const users=(await db.query(`select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid u,mod(abs(hashtextextended($1||':'||('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))||':'||current_date::text,97)::numeric),100)<10 rare from generate_series(1,100)n`,[g])).rows;
for(const rare of [true,false]){
 const uid=users.find(u=>u.rare===rare).u;await db.query('insert into auth.users values($1)',[uid]);await db.query("insert into guild_members(guild_id,user_id,player_key) values($1,$2,'Test')",[g,uid]);await db.query('insert into player_progress_public(guild_id,user_id,level,personal_xp) values($1,$2,75,821400)',[g,uid]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 const before=(await db.query('select legendary_draw_state() r')).rows[0].r;assert.equal(before.ready,rare);assert.deepEqual(before,(await db.query('select legendary_draw_state() r')).rows[0].r,'reload cannot reroll');
 for(let i=0;i<2;i++){
  const qid=crypto.randomUUID(),cid=crypto.randomUUID();await db.query("insert into quest_templates(id,guild_id,key,category,owner_type) values($1,$2,'legendary-test','Other','shared')",[qid,g]);await db.query('insert into quest_completions(id,guild_id,quest_id,completed_by) values($1,$2,$3,$4)',[cid,g,qid,uid]);await db.query('insert into quest_completion_rewards values($1,$2,100,\'{}\')',[cid,uid]);await db.query('update player_progress_public set personal_xp=personal_xp+100 where user_id=$1',[uid]);
  const r=(await db.query('select game_private.apply_quest_perks($1) r',[cid])).rows[0].r;assert.equal(r.actor_bonus,rare&&i===0?25:0);if(i===0&&rare)await db.query('update quest_completions set reversed_at=now() where id=$1',[cid]);
 }
 assert.equal((await db.query('select legendary_draw_state() r')).rows[0].r.ready,false);
}
console.log('PASS rare/quiet personal draws; stable daily roll; first reward only; undo cannot farm bonus; accurate state');await db.close();
