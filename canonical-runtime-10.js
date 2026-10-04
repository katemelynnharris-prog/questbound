// === Questbound canonical pass 10: Quest Watch urgency + direct completion ===
// Keep recurring responsibilities quiet until they are actually approaching their cadence.

async function loadQuests(){
  const {data,error}=await sb.from('quest_templates').select('id,key,title,objective,flavor,category,owner_type,assignee_key,assigned_user_id,value_tier,xp_personal,xp_campaign,random_eligible,gauntlet_eligible,random_rarity,visibility,recurrence,late_penalty,warning_days,notes,major_achievement,created_at').eq('guild_id',state.membership.guild_id).eq('active',true).order('category').order('title');
  if(error)throw error;state.quests=data||[];
}

function qbWatchDate(s){return s?new Date(String(s).slice(0,10)+'T12:00:00'):null}
function qbWatchDayDiff(a,b){return Math.round((qbWatchDate(b)-qbWatchDate(a))/86400000)}
function qbWatchAdd(date,count,unit){
  const d=qbWatchDate(date);if(!d)return null;
  if(unit==='days')d.setDate(d.getDate()+count);
  else if(unit==='weeks')d.setDate(d.getDate()+count*7);
  else if(unit==='months')d.setMonth(d.getMonth()+count);
  else if(unit==='years')d.setFullYear(d.getFullYear()+count);
  return d.toISOString().slice(0,10);
}
function qbWatchCompletionDate(c){return localDate(new Date(c.completed_at))}
function qbWatchQuestCompletions(q){return state.completions.filter(c=>!c.reversed_at&&c.quest_id===q.id).sort((a,b)=>new Date(b.completed_at)-new Date(a.completed_at))}
function qbWatchDefaultWindow(q){
  const r=safeMeta(q.recurrence),t=r.type;
  if(Number(q.warning_days)>0)return Number(q.warning_days);
  if(t==='weekly'||t==='room_slots')return 2;
  if(t==='interval'){
    if(r.unit==='days')return Math.min(4,Math.max(1,Number(r.count||1)));
    if(r.unit==='weeks')return Number(r.count||1)<=1?2:4;
    if(r.unit==='months')return Number(r.count||1)<=1?7:10;
    return 14;
  }
  if(t==='monthly_fixed'||t==='monthly_dates')return 7;
  if(t==='frequency')return r.period==='month'?7:r.period==='quarter'?14:r.period==='year'?21:10;
  if(t==='seasonal'||t==='seasonal_wildcard')return 14;
  return 3;
}
function qbWatchPeriodBounds(period,today){
  const d=qbWatchDate(today),y=d.getFullYear(),m=d.getMonth();
  if(period==='month')return {start:`${y}-${String(m+1).padStart(2,'0')}-01`,end:new Date(y,m+1,0,12).toISOString().slice(0,10)};
  if(period==='quarter'){const qm=Math.floor(m/3)*3;return {start:`${y}-${String(qm+1).padStart(2,'0')}-01`,end:new Date(y,qm+3,0,12).toISOString().slice(0,10)}}
  return {start:`${y}-01-01`,end:`${y}-12-31`};
}
function qbWatchWeeklyDue(q,today){
  const r=safeMeta(q.recurrence),days=Array.isArray(r.days)?r.days:[];
  if(!days.length){const d=qbWatchDate(today);d.setDate(d.getDate()+(7-d.getDay())%7);return d.toISOString().slice(0,10)}
  const map={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6},now=qbWatchDate(today),wd=now.getDay();
  const offsets=days.map(x=>map[String(x).slice(0,3)]).filter(Number.isFinite).map(x=>(x-wd+7)%7).sort((a,b)=>a-b);
  const d=qbWatchDate(today);d.setDate(d.getDate()+(offsets[0]??0));return d.toISOString().slice(0,10);
}
function qbWatchMeta(q){
  const today=localDate(),r=safeMeta(q.recurrence),t=r.type||'once',windowDays=qbWatchDefaultWindow(q),cs=qbWatchQuestCompletions(q);let due=null,done=false;
  if(t==='interval'){
    const anchor=cs[0]?qbWatchCompletionDate(cs[0]):(q.created_at?localDate(new Date(q.created_at)):today);
    due=qbWatchAdd(anchor,Math.max(1,Number(r.count||1)),r.unit||'weeks');
  }else if(t==='weekly'){
    if(isCompletedForCurrentOccurrence(q))done=true;else due=qbWatchWeeklyDue(q,today);
  }else if(t==='monthly_fixed'){
    if(isCompletedForCurrentOccurrence(q))done=true;else {const [y,m]=today.split('-').map(Number),day=Math.min(Number(r.day||1),new Date(y,m,0).getDate());due=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`}
  }else if(t==='monthly_dates'){
    if(isCompletedForCurrentOccurrence(q))done=true;else {const [y,m,td]=today.split('-').map(Number),ds=(r.days||[]).map(Number).filter(Boolean).sort((a,b)=>a-b),next=ds.find(x=>x>=td)??ds.at(-1);if(next)due=`${y}-${String(m).padStart(2,'0')}-${String(next).padStart(2,'0')}`}
  }else if(t==='frequency'){
    const bounds=qbWatchPeriodBounds(r.period||'month',today),count=cs.filter(c=>{const d=qbWatchCompletionDate(c);return d>=bounds.start&&d<=bounds.end}).length,target=Math.max(1,Number(r.target||1));
    done=count>=target;due=bounds.end;
  }else if(t==='seasonal'){
    const y=Number(today.slice(0,4)),month=Number(r.month||0);if(month===Number(today.slice(5,7)))due=new Date(y,month,0,12).toISOString().slice(0,10);else return null;
    done=cs.some(c=>qbWatchCompletionDate(c).slice(0,7)===today.slice(0,7));
  }else if(t==='seasonal_wildcard'){
    const m=Number(today.slice(5,7)),seasonEnd=m<=2?2:m<=5?5:m<=8?8:11,y=Number(today.slice(0,4));due=new Date(y,seasonEnd,0,12).toISOString().slice(0,10);
    done=cs.some(c=>{const d=qbWatchCompletionDate(c),mm=Number(d.slice(5,7));return d.slice(0,4)===today.slice(0,4)&&Math.floor((mm-1)/3)===Math.floor((m-1)/3)});
  }else if(t==='room_slots'){
    done=isCompletedForCurrentOccurrence(q);const d=qbWatchDate(today);d.setDate(d.getDate()+(6-d.getDay()));due=d.toISOString().slice(0,10);
  }else return null;
  if(done||!due)return null;
  const days=qbWatchDayDiff(today,due);if(days>windowDays)return null;
  return {q,due,days,windowDays};
}
function qbWatchStatus(meta){const n=meta.days;if(n<0)return `${Math.abs(n)} day${Math.abs(n)===1?'':'s'} overdue`;if(n===0)return'Due today';if(n===1)return'Due tomorrow';return`Due in ${n} days`}
function questWatchItems(){
  return state.quests.filter(q=>q.recurrence?.type!=='daily'&&q.owner_type!=='personal_daily'&&canOwnQuest(q)).map(q=>qbWatchMeta(q)).filter(Boolean).sort((a,b)=>a.days-b.days||a.q.title.localeCompare(b.q.title)).slice(0,5).map(x=>x.q);
}
function questWatchCard(){
  const metas=state.quests.filter(q=>q.recurrence?.type!=='daily'&&q.owner_type!=='personal_daily'&&canOwnQuest(q)).map(q=>qbWatchMeta(q)).filter(Boolean).sort((a,b)=>a.days-b.days||a.q.title.localeCompare(b.q.title)).slice(0,5);
  return `<section class="card home-card"><p class="eyebrow">⏳ QUEST WATCH</p><h2>Deadlines & rhythms</h2><div class="watch-list">${metas.map(({q,...m})=>`<div class="watch-row"><div><b>${esc(q.title)}</b><span>${esc(qbWatchStatus(m))} · ${esc(recurrenceLabel(q))} · ${esc(ownerLabel(q))}</span></div><button data-complete="${q.id}" data-source="journal" class="mini">Complete</button></div>`).join('')||'<div class="empty-inline">Nothing needs your attention yet.</div>'}</div></section>`;
}

const qbWireHomeButtonsBeforeV10=wireHomeButtons;
wireHomeButtons=function(){qbWireHomeButtonsBeforeV10();wireQuestButtons()};
