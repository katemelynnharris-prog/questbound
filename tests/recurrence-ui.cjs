const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const q=(id,recurrence={type:'repeatable'})=>({id,recurrence,random_eligible:true,owner_type:'shared'});
const ctx={state:{quests:[q('oct',{type:'seasonal',month:10}),q('nov',{type:'seasonal',month:11}),q('interval'),q('done')],questCycles:{oct:{available:true,active:true,complete:false},nov:{available:false,active:false,complete:false},interval:{available:false,active:true,complete:true},done:{available:false,active:true,complete:true}}},
  sb:{rpc:async()=>({data:[]})},localDate:()=> '2026-10-07',ownUserId:()=> 'kate',canOwnQuest:()=>true,seededHash:x=>x.length,
  loadQuests:async()=>{},occurrenceKey:()=> 'old',isCompletedForCurrentOccurrence:()=>false,qbDailyCount:()=>0,qbDailyCountV20:()=>0,
  questRow:()=>'<div>Title</div><div class="quest-chips"></div><button data-complete="test">Complete</button>',safeMeta:x=>x||{},esc:x=>x,
  recurrenceLabel:()=>'',qbWatchMeta:()=>null,qbWatchDayDiff:()=>0,qbWatchDefaultWindow:()=>3,qbReloadCore:async()=>{},
  document:{addEventListener:()=>{}},setInterval:()=>{},console,Intl,Date};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('canonical-runtime-21.js','utf8'),ctx);
assert.deepEqual(Array.from(ctx.randomBoard(),x=>x.id),['oct']);
assert.match(ctx.questRow(ctx.state.quests[1]),/disabled/);
assert.match(ctx.questRow(ctx.state.quests[1]),/Out of season/);
assert.equal(ctx.isCompletedForCurrentOccurrence(ctx.state.quests[3]),true);
assert.equal(ctx.recurrenceLabel(q('writing')),'Repeatable · resets daily');
ctx.state.questCycles.oct.occurrence_key='seasonal:2026-10-01';
assert.equal(ctx.occurrenceKey(ctx.state.quests[0]),'seasonal:2026-10-01');
console.log('Recurrence UI checks passed');
