// The database owns recurrence eligibility, including legacy completion history.
function qbCycle(q){return state.questCycles?.[q?.id]||null}
async function loadQuestCycles(){
  const {data,error}=await sb.rpc('quest_recurrence_states');
  if(error){state.questCycles={};throw error;}
  state.questCycles=Object.fromEntries((data||[]).map(x=>[x.quest_id,x]));
  state.questCycleDate=data?.[0]?.date||localDate();
}
const qbLoadQuestsBeforeV21=loadQuests;
loadQuests=async function(){await qbLoadQuestsBeforeV21();await loadQuestCycles()};
const qbOccurrenceBeforeV21=occurrenceKey;
occurrenceKey=function(q){return qbCycle(q)?.occurrence_key||qbOccurrenceBeforeV21(q)};
const qbCompletedBeforeV21=isCompletedForCurrentOccurrence;
isCompletedForCurrentOccurrence=function(q){return qbCycle(q)?.complete??qbCompletedBeforeV21(q)};
const qbDailyCountBeforeV21=qbDailyCount;
qbDailyCount=function(q,uid=ownUserId(),date=localDate()){
  const c=qbCycle(q);return c&&uid===ownUserId()&&date===c.date?c.count:qbDailyCountBeforeV21(q,uid,date);
};
const qbDailyCountV20BeforeV21=qbDailyCountV20;
qbDailyCountV20=function(q,date=localDate()){const c=qbCycle(q);return c&&date===c.date?c.count:qbDailyCountV20BeforeV21(q,date)};
randomBoard=function(){
  const nonce=Number(state.randomDraw?.nonce||0),key=`${state.guild?.id||''}:${localDate()}:${state.membership?.player_key||''}:${nonce}`;
  return state.quests.filter(q=>q.random_eligible&&!q.hidden_encounter&&q.owner_type!=='personal_daily'&&canOwnQuest(q)&&qbCycle(q)?.available)
    .map(q=>({q,n:seededHash(`${key}:${q.id}`)})).sort((a,b)=>a.n-b.n).slice(0,3).map(x=>x.q);
};
const qbQuestRowBeforeV21=questRow;
questRow=function(q,options){
  const c=qbCycle(q),r=safeMeta(q.recurrence);
  let html=qbQuestRowBeforeV21(q,options);
  if(c&&!c.available&&!c.complete){
    html=html.replace(/(<button data-complete[^>]*)(>)/,'$1 disabled$2');
    html=html.replace(/>Complete<\/button>/,`>${c.active?'Not due yet':'Out of season'}</button>`);
  }
  if(c&&['frequency','room_slots'].includes(r.type)){
    const label=c.slot?` · ${esc(c.slot)}`:'';
    html=html.replace('</div><div class="quest-chips">',` <span class="qb-count-progress">${Math.min(c.count,c.target)} / ${c.target}${label}</span></div><div class="quest-chips">`);
  }
  return html;
};
const qbRecurrenceLabelBeforeV21=recurrenceLabel;
recurrenceLabel=function(q){
  const r=safeMeta(q.recurrence);
  if(r.type==='repeatable')return 'Repeatable · resets daily';
  if(r.type==='seasonal')return `Seasonal · ${new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,Number(r.month)-1,1)))}`;
  return qbRecurrenceLabelBeforeV21(q);
};
const qbWatchMetaBeforeV21=qbWatchMeta;
qbWatchMeta=function(q){
  const c=qbCycle(q),r=safeMeta(q.recurrence);
  if(c&&(!c.active||c.complete))return null;
  if(c?.due&&['interval','frequency','monthly_dates','seasonal','seasonal_wildcard'].includes(r.type)){
    const days=qbWatchDayDiff(localDate(),c.due),windowDays=qbWatchDefaultWindow(q);
    return days<=windowDays?{q,due:c.due,days,windowDays}:null;
  }
  return qbWatchMetaBeforeV21(q);
};
// Reopen the ledger after guild-local midnight, including a sleeping browser tab.
let qbCycleRefreshBusy=false;
async function qbRefreshDay(){
  if(qbCycleRefreshBusy||!state.membership||!state.questCycleDate||state.questCycleDate===localDate())return;
  qbCycleRefreshBusy=true;
  try{await qbReloadCore()}catch(e){console.warn('Unable to refresh quest day',e)}finally{qbCycleRefreshBusy=false}
}
setInterval(qbRefreshDay,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)qbRefreshDay()});
