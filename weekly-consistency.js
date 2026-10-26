/* Daily check-ins for weekly consistency challenges; no Daily Ledger entries. */
async function qbLoadWeeklyConsistency(){const {data,error}=await sb.rpc('weekly_consistency_state');if(error){state.weeklyConsistency=null;throw error}state.weeklyConsistency=data}
const qbLoadAllBeforeWeeklyConsistency=loadAll;
loadAll=async function(){await qbLoadAllBeforeWeeklyConsistency();try{await qbLoadWeeklyConsistency()}catch(e){console.warn('Weekly check-ins unavailable',e)}};
function qbWeeklyCheckinsCard(){
 const w=state.weekly,c=state.weeklyConsistency;if(!w)return '';
 const m=safeMeta(w.metadata),p=progressPct(w.progress,w.target);
 if(!c||c.weekly_id!==w.id)return `<section class="card home-card"><p class="eyebrow">WEEKLY CHALLENGE</p><h2>${esc(w.title)}</h2><p>${esc(m.description)}</p><p>Daily check-ins are loading. Refresh to try again.</p></section>`;
 const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 const weekDates=Array.from({length:7},(_,i)=>{const d=new Date(c.week_key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)});
 const rows=c.per_player?c.players:[{player:'Together',user_id:ownUserId(),days:c.days}];
 return `<section class="card home-card weekly-card qb-weekly-consistency"><p class="eyebrow">🛡 WEEKLY CHALLENGE</p><h2>${esc(w.title)}</h2><p>${esc(m.description)}</p><div class="progress"><span style="width:${p}%"></span></div><div class="progress-meta"><b>${fmt(w.progress)} / ${fmt(w.target)} daily check-ins</b><span>+${fmt(m.reward_campaign_xp)} Campaign XP + Weekly Cache</span></div>${rows.map(r=>{const mine=!c.per_player||r.user_id===ownUserId(),days=r.days||[];return `<div class="qb-weekly-day-row"><div><b>${esc(r.player)}</b><span>${fmt(days.length)} / 5 days</span></div><div class="qb-weekly-day-buttons">${weekDates.map((date,i)=>{const done=days.includes(date),future=date>c.today,disabled=done||future||!mine||days.length>=5||c.completed;return `<button type="button" class="ghost ${done?'qb-weekly-day-done':''}" data-weekly-day="${date}" aria-label="${esc(r.player)}: ${names[i]}, ${date}${done?', recorded':''}" ${disabled?'disabled':''}>${done?'✓ ':''}${names[i]}</button>`}).join('')}</div></div>`}).join('')}<p class="fine">Mark a day after meeting its requirement. ${c.per_player?'Each person records their own five days.':'Either of you can record a shared day.'} Missed check-ins can be recorded later in the same week. Future days stay locked.</p>${c.completed?'<p class="qb-weekly-success">✓ Challenge complete · reward awarded</p>':''}</section>`;
}
const qbWeeklyRoadBeforeConsistency=weeklyRoadCard;
weeklyRoadCard=function(){return state.weekly?.metadata?.tracking==='daily_checkins'?qbWeeklyCheckinsCard():qbWeeklyRoadBeforeConsistency()};
let qbWeeklyDayBusy=false;
function qbWireWeeklyDays(){screen.querySelectorAll('[data-weekly-day]').forEach(b=>b.onclick=async()=>{
 if(qbWeeklyDayBusy||b.disabled)return;qbWeeklyDayBusy=true;const before=Number(state.weekly.progress||0);screen.querySelectorAll('[data-weekly-day]').forEach(x=>x.disabled=true);
 try{const {data,error}=await sb.rpc('record_weekly_day',{p_date:b.dataset.weeklyDay});if(error)throw error;state.weeklyConsistency=data;await qbReloadCore();showToast(data?.completed?'Weekly challenge complete · bounty and Weekly Cache awarded':Number(state.weekly.progress)>before?'Weekly check-in recorded.':'That day is already recorded.')}catch(e){alert(e.message);renderHome()}finally{qbWeeklyDayBusy=false}
})}
const qbHomeBeforeWeeklyConsistency=renderHome;
renderHome=function(){const result=qbHomeBeforeWeeklyConsistency();qbWireWeeklyDays();return result};
