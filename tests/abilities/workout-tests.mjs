import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();for(const path of ['schema.sql','config.sql','quest-perks.sql','extra-schema.sql','original-completions.sql','workout-expedition.sql'])await db.exec(await fs.readFile(new URL(path,import.meta.url),'utf8'));
const g='10000000-0000-0000-0000-000000000001',u='20000000-0000-0000-0000-000000000001',id='60000000-0000-0000-0000-000000000001';
await db.query('insert into auth.users values($1)',[u]);await db.query('insert into guilds values($1)',[g]);await db.query("insert into guild_members(guild_id,user_id,player_key) values($1,$2,'Kate')",[g,u]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);
let count=0;
async function test(name,level,kind,specs,expected,wind=false,mw=false){
 await db.exec('begin');try{
  const xp=(level-1)**2*150;
  await db.query('insert into player_progress_public(guild_id,user_id,personal_xp,level) values($1,$2,$3,$4)',[g,u,xp,level]);
  await db.query('insert into ability_preferences values($1,$2,$3)',[g,u,JSON.stringify(mw?{masterwork:'second_wind'}:{})]);
  for(const [key,rank] of specs)await db.query('insert into player_specializations values($1,$2,$3,$4)',[g,u,key,rank]);
  let r;
  if(kind==='training'){
   await db.query("insert into training_assignments(id,guild_id,user_id,path_key,title,xp_personal,xp_campaign) values($1,$2,$3,'rider','Test Workout',200,0)",[id,g,u]);
   r=(await db.query('select public.complete_training_assignment($1) r',[id])).rows[0].r;
   if(wind){await db.query('update player_progress_public set personal_xp=personal_xp+200');await db.query("update activity_events set personal_xp=personal_xp+200,metadata=metadata||'{\"second_wind_bonus\":200}'");r.personal_xp+=200;}
   r=(await db.query('select game_private.apply_training_perks($1,$2) r',[id,JSON.stringify(r)])).rows[0].r;
   assert.equal(r.ability_bonus,expected[0],name);assert.equal((await db.query("select personal_xp from activity_events where event_type='training_complete'")).rows[0].personal_xp,r.personal_xp,name+' undo audit');
   const before=(await db.query('select personal_xp from player_progress_public')).rows[0].personal_xp;
   await db.query('select game_private.apply_training_perks($1,$2)',[id,JSON.stringify(r)]);assert.equal((await db.query('select personal_xp from player_progress_public')).rows[0].personal_xp,before,name+' idempotent');
  }else{
   await db.query("insert into expeditions(id,guild_id,drawn_by,title,xp_personal,xp_campaign,renown_reward) values($1,$2,$3,'Test Expedition',200,0,5)",[id,g,u]);
   r=(await db.query('select public.complete_expedition_abilities($1) r',[id])).rows[0].r;
   assert.equal(r.ability_bonus,expected[0],name);assert.equal(r.renown_bonus,expected[1],name+' renown');
   assert.equal((await db.query('select jsonb_array_length(revealed_cells) n from exploration_state')).rows[0].n,expected[2],name+' cells');
   assert.equal((await db.query("select personal_xp from activity_events where event_type='expedition'")).rows[0].personal_xp,r.personal_xp,name+' history');
   await db.exec('savepoint duplicate_attempt');
   await assert.rejects(()=>db.query('select public.complete_expedition_abilities($1)',[id]),/Expedition unavailable/);
   await db.exec('rollback to duplicate_attempt');
  }
  assert.equal((await db.query('select personal_xp from player_progress_public')).rows[0].personal_xp,xp+r.personal_xp,name+' progress');console.log('PASS',name);count++;
 }finally{await db.exec('rollback');}
}
await test('Training locked before Signet',14,'training',[['Vanguard',2]],[0]);
await test('Normal workout Battle Rhythm',15,'training',[['Vanguard',2]],[20]);
await test('Wind Vanguard mastery and Rhythm',15,'training',[['Vanguard',2]],[70],true);
await test('Wind Masterwork stacks',50,'training',[['Vanguard',2]],[120],true,true);
await test('Wind Masterwork below unlock',49,'training',[],[0],true,true);
await test('Masterwork without Wind adds nothing',50,'training',[],[0],false,true);
await test('Expedition before Signet',14,'expedition',[['Archivist',2],['Pathfinder',2]],[0,0,1]);
await test('Research Expedition',15,'expedition',[['Archivist',2]],[50,0,1]);
await test('Cartographer',15,'expedition',[['Pathfinder',1]],[0,0,2]);
await test('Farther Roads',15,'expedition',[['Pathfinder',2]],[0,1,2]);
await test('Combined Expedition paths',15,'expedition',[['Archivist',2],['Pathfinder',2]],[50,1,2]);
console.log(count+' real-completion PostgreSQL staging tests passed');await db.close();
