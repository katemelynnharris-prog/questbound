import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(await fs.readFile(new URL('schema.sql',import.meta.url),'utf8'));
await db.exec(await fs.readFile(new URL('config.sql',import.meta.url),'utf8'));
await db.exec(await fs.readFile(new URL('quest-perks.sql',import.meta.url),'utf8'));
const gid='10000000-0000-0000-0000-000000000001',a='20000000-0000-0000-0000-000000000001',b='20000000-0000-0000-0000-000000000002',qid='30000000-0000-0000-0000-000000000001',cid='40000000-0000-0000-0000-000000000001',camp='50000000-0000-0000-0000-000000000001';
await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query('insert into guilds values($1)',[gid]);await db.query('insert into guild_members(guild_id,user_id,player_key) values($1,$2,\'Kate\'),($1,$3,\'Drew\')',[gid,a,b]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
let count=0;
async function test(name,{level=50,category='Home',owner='shared',choices={},spec=null,rank=0,rested=false,wind=false,target=1,step=1,base=100,campaignXP=0,coop=false}={},expected){
 await db.exec('begin');
 try{
  const reward=target===1?base:(step===target?base-Math.floor(base/target)*(target-1):Math.floor(base/target));
  await db.query('insert into quest_templates(id,guild_id,key,title,category,owner_type,xp_personal,xp_campaign,recurrence) values($1,$2,\'test\',\'Test\',$3,$4,$5,20,$6)',[qid,gid,category,owner,base,JSON.stringify({type:target===1?'repeatable':'daily',count_target:target})]);
  const mods=wind?[{name:'Second Wind',user_id:a}]:[];
  await db.query('insert into quest_completions(id,guild_id,quest_id,completed_by,occurrence_key,modifiers) values($1,$2,$3,$4,$5,$6)',[cid,gid,qid,a,`daily:step:${step}`,JSON.stringify(mods)]);
  for(const uid of coop?[a,b]:[a]){
   const xp=(level-1)**2*150+reward;
   await db.query('insert into player_progress_public(guild_id,user_id,personal_xp,level) values($1,$2,$3,$4)',[gid,uid,xp,level]);
   await db.query('insert into quest_completion_rewards values($1,$2,$3,$4)',[cid,uid,reward,JSON.stringify(rested?{rested_bonus:25}:{})]);
   await db.query('insert into ability_preferences values($1,$2,$3)',[gid,uid,JSON.stringify(uid===a?choices:{})]);
  }
  if(spec)await db.query('insert into player_specializations values($1,$2,$3,$4)',[gid,a,spec,rank]);
  await db.query('insert into campaigns(id,guild_id,campaign_xp,goal_xp) values($1,$2,$3,25000)',[camp,gid,campaignXP]);
  await db.query('insert into campaign_contributions values($1,$2,20)',[camp,a]);
  await db.query('insert into activity_events(id,guild_id,actor_user_id,event_type,personal_xp,campaign_xp,metadata) values($1,$2,$3,\'quest_complete\',$4,20,$5)',[cid,gid,a,reward,JSON.stringify({completion_id:cid})]);
  const result=(await db.query('select game_private.apply_quest_perks($1) result',[cid])).rows[0].result;
  assert.equal(result.actor_bonus,expected[0],name+' Personal XP');assert.equal(result.campaign_bonus,expected[1]||0,name+' Campaign XP');
  const rows=(await db.query('select user_id,personal_xp_awarded from quest_completion_rewards order by user_id')).rows;
  assert.equal(rows[0].personal_xp_awarded,reward+expected[0],name+' stored reward');if(coop)assert.equal(rows[1].personal_xp_awarded,reward+(expected[2]||0),name+' partner reward');
  const xpBefore=(await db.query('select personal_xp from player_progress_public order by user_id')).rows;
  await db.query('select game_private.apply_quest_perks($1)',[cid]);assert.deepEqual((await db.query('select personal_xp from player_progress_public order by user_id')).rows,xpBefore,name+' idempotence');
  const charge=(await db.query('select count(*)::int n from contract_uses')).rows[0].n;assert.equal(charge,expected[3]||0,name+' Contract cooldown');
  await db.query('update player_progress_public p set personal_xp=personal_xp-r.personal_xp_awarded from quest_completion_rewards r where p.user_id=r.user_id and r.completion_id=$1',[cid]);
  assert.ok((await db.query('select personal_xp from player_progress_public')).rows.every(r=>r.personal_xp===(level-1)**2*150),name+' exact rollback audit');
  console.log('PASS',name);count++;
 }finally{await db.exec('rollback');}
}
await test('No bonus before unlock',{level:14,spec:'Steward',rank:2,choices:{contract:qid,favor:'Home',masterwork:'contract'}},[0]);
await test('Contract adds one base reward',{level:25,choices:{contract:qid}},[100,0,0,1]);
await test('Contract respects pre-award level',{level:24,choices:{contract:qid}},[0]);
await test('Contract Masterwork',{choices:{contract:qid,masterwork:'contract'}},[125,0,0,1]);
await test('Rally rewards both players',{level:30,owner:'co-op',coop:true},[10,0,10]);
await test('Rally respects unlock',{level:29,owner:'co-op',coop:true},[0]);
await test('Rally Masterwork is personal',{owner:'co-op',coop:true,choices:{masterwork:'rally'}},[20,0,10]);
await test('Favor matching category',{level:40,choices:{favor:'Home'}},[20]);
await test('Favor does not affect another category',{level:40,category:'Growth',choices:{favor:'Home'}},[0]);
await test('Favor Masterwork',{choices:{favor:'Home',masterwork:'favor'}},[30]);
await test('Rested Masterwork only when consumed',{rested:true,choices:{masterwork:'rested'}},[25]);
await test('Rested Masterwork no bank consumed',{choices:{masterwork:'rested'}},[0]);
await test('Wind Masterwork',{wind:true,category:'Fitness',choices:{masterwork:'second_wind'}},[25]);
await test('Deep Study',{level:15,category:'Knowledge',spec:'Archivist',rank:1},[10]);
await test('Vanguard Wind mastery',{level:15,wind:true,category:'Fitness',spec:'Vanguard',rank:1},[25]);
await test('Battle Rhythm',{level:15,category:'Fitness',spec:'Vanguard',rank:2},[10]);
await test('Good Order',{level:15,spec:'Steward',rank:1},[10]);
await test('Guild Provisioner',{level:15,spec:'Steward',rank:2},[10,2]);
await test('Guild Provisioner goal cap',{level:15,spec:'Steward',rank:2,campaignXP:24999},[10,1]);
await test('Counter bonuses use per-log base',{level:25,choices:{contract:qid},target:3,step:1},[33,0,0,1]);
await test('Counter final remainder preserved',{level:25,choices:{contract:qid},target:3,step:3},[34,0,0,1]);
await test('Selected choices cannot apply retroactively',{choices:{contract:qid,favor:'Home',masterwork:'contract',_updated_at:'2099-01-01T00:00:00Z'}},[0]);
await test('Stacking Contract Favor and Steward',{choices:{contract:qid,favor:'Home',masterwork:'contract'},spec:'Steward',rank:2},[155,2,0,1]);
console.log(`${count} isolated PostgreSQL tests passed`);await db.close();
