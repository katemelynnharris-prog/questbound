// === Questbound parity audit pass 9: progression, calendar navigation, Treasury archives ===
// Loaded into the same canonical renderer source before first execution. No observers.

async function loadTreasuryArchives(){
  const {data,error}=await sb.from('treasury_funds').select('*').eq('guild_id',state.membership.guild_id).eq('status','archived').order('archived_at',{ascending:false}).limit(12);
  if(error)throw error;state.treasuryArchives=data||[];
}
const qbLoadAllBeforeV9=loadAll;
loadAll=async function(){
  await qbLoadAllBeforeV9();
  await loadTreasuryArchives().catch(e=>{console.warn(e);state.treasuryArchives=[]});
};

function qbTreasuryArchiveCard(){
  const list=state.treasuryArchives||[];
  if(!list.length)return'';
  return `<section class="card home-card qb-treasury-archives"><details><summary class="qb-admin-summary"><span><small>🏛 TREASURY ARCHIVES</small><b>${list.length} past fund${list.length===1?'':'s'}</b></span><span class="count-pill">preserved</span></summary><div class="qb-history-list">${list.map(f=>`<div class="qb-history-row"><div><b>${esc(f.name)}</b><small>${f.archived_at?new Date(f.archived_at).toLocaleDateString():''}</small></div><span>${money(f.balance)} / ${money(f.target_amount)} Gold</span></div>`).join('')}</div></details></section>`;
}
function renderGuild(){
  screen.innerHTML=`${guildSharedSummary()}${campaignHome()}${qbTreasuryCard()}${qbTreasuryArchiveCard()}<div class="home-two independent">${qbVaultCard()}${gauntletCard()}</div><div class="home-two independent"><section class="card home-card"><p class="eyebrow">🧙 SPECIALIZATIONS</p><h2>Guild Paths</h2><p>Archivist · Vanguard · Pathfinder · Steward. Personal choices are managed from Character.</p></section>${activityCard()}</div>`;
  qbWireCampaign();qbWireGuildActions();qbWireActivityUndo();
}

function qbNextLevelThreshold(xp){
  const current=levelFor(xp);let hi=Math.max(xp+100,100),guard=0;
  while(levelFor(hi)<=current&&guard++<200){hi+=Math.max(100,Math.floor(hi*.08))}
  if(levelFor(hi)<=current)return null;
  let lo=xp+1;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(levelFor(mid)>current)hi=mid;else lo=mid+1}return lo;
}
function qbCharacterProgressPanel(){
  const {uid,progress}=selectedCharacter(),xp=Number(progress?.personal_xp||0),level=Number(progress?.level||levelFor(xp)),next=qbNextLevelThreshold(xp),rank=rankFor(level),nextRank=rankFor(level+1),toNext=next?Math.max(0,next-xp):0,pct=next?Math.min(100,Math.max(0,100-(toNext/Math.max(1,next))*100)):100;
  return `<section class="card qb-panel qb-progression-panel"><div class="card-head"><div><p class="eyebrow">✦ PROGRESSION</p><h2>Level ${level} · ${esc(rank.name)}</h2></div><span class="count-pill">${fmt(xp)} XP</span></div><div class="progress"><span style="width:${pct}%"></span></div><div class="progress-meta"><b>${next?`${fmt(toNext)} XP to Level ${level+1}`:'Current level cap reached'}</b><span>${next?`Next rank state: ${esc(nextRank.name)}`:''}</span></div><p class="fine">Campaign XP is shared. Personal XP, rank, gear, specializations, and Training remain player-specific.</p></section>`;
}
const qbRenderCharacterBeforeV9=renderCharacter;
renderCharacter=function(){
  qbRenderCharacterBeforeV9();
  const hero=screen.querySelector('.qb-character-hero');if(!hero)return;
  const wrap=document.createElement('div');wrap.innerHTML=qbCharacterProgressPanel();hero.insertAdjacentElement('afterend',wrap.firstElementChild);
};

function qbCalendarCursor(){
  if(!Number.isFinite(Number(state.qbCalendarOffset)))state.qbCalendarOffset=0;
  const base=new Date(localDate()+'T12:00:00');base.setDate(1);base.setMonth(base.getMonth()+Number(state.qbCalendarOffset||0));return base;
}
function renderCalendar(){
  const cursor=qbCalendarCursor(),year=cursor.getFullYear(),month=cursor.getMonth()+1,days=new Date(year,month,0).getDate(),first=new Date(year,month-1,1).getDay(),holidays=qbHolidays(year).filter(h=>h.month===month),current=localDate(),currentMonth=current.slice(0,7)===`${year}-${String(month).padStart(2,'0')}`;
  const dated=state.quests.filter(q=>!q.hidden_encounter&&canOwnQuest(q)&&(q.due_date||['monthly_fixed','monthly_dates','weekly'].includes(safeMeta(q.recurrence).type))),events=new Map();
  const add=(d,x)=>{if(!events.has(d))events.set(d,[]);events.get(d).push(x)};holidays.forEach(h=>add(h.day,{type:'holiday',label:h.name}));dated.forEach(q=>qbQuestDatesForMonth(q,year,month).forEach(d=>add(d,{type:'quest',label:q.title,q})));
  const cells=[];for(let i=0;i<first;i++)cells.push('<div class="qb-cal-cell blank"></div>');for(let d=1;d<=days;d++){const es=events.get(d)||[],today=currentMonth&&Number(current.slice(8,10))===d;cells.push(`<div class="qb-cal-cell ${today?'today':''}"><b>${d}</b>${es.slice(0,4).map(e=>`<span class="${e.type}">${esc(e.label)}</span>`).join('')}${es.length>4?`<small>+${es.length-4} more</small>`:''}</div>`)}
  const flexible=state.quests.filter(q=>!q.hidden_encounter&&['interval','frequency'].includes(safeMeta(q.recurrence).type)&&canOwnQuest(q));
  screen.innerHTML=`<section class="ledger-head qb-calendar-head"><div><p class="eyebrow">📅 GUILD CALENDAR</p><h1>${new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(cursor)}</h1><p>Fixed obligations and explicit due dates appear on their real dates. Hidden/seasonal Random encounters stay off the calendar so they remain surprises.</p></div><div class="qb-calendar-nav"><button id="qbCalPrev" class="ghost">← Previous</button><button id="qbCalToday" class="ghost" ${Number(state.qbCalendarOffset||0)===0?'disabled':''}>Today</button><button id="qbCalNext" class="ghost">Next →</button></div></section><div class="qb-calendar-layout"><section class="card qb-calendar-card"><div class="qb-cal-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<span>${x}</span>`).join('')}</div><div class="qb-cal-grid">${cells.join('')}</div><div class="qb-calendar-legend"><span class="holiday">Holiday</span><span class="quest">Quest / obligation</span></div></section><div class="qb-calendar-side"><section class="card"><p class="eyebrow">🎉 HOLIDAYS & OBSERVANCES</p><div class="qb-history-list">${holidays.map(h=>`<div class="qb-history-row"><b>${esc(h.name)}</b><span>${month}/${h.day}</span></div>`).join('')||'<div class="empty-inline">No listed holidays this month.</div>'}</div></section><section class="card"><p class="eyebrow">THE ROAD AHEAD</p><div class="qb-history-list">${flexible.slice(0,12).map(q=>`<div class="qb-history-row"><b>${esc(q.title)}</b><span>${esc(recurrenceLabel(q))}</span></div>`).join('')||'<div class="empty-inline">No flexible recurring quests.</div>'}</div></section></div></div>`;
  document.querySelector('#qbCalPrev')?.addEventListener('click',()=>{state.qbCalendarOffset=Number(state.qbCalendarOffset||0)-1;renderCalendar()});
  document.querySelector('#qbCalNext')?.addEventListener('click',()=>{state.qbCalendarOffset=Number(state.qbCalendarOffset||0)+1;renderCalendar()});
  document.querySelector('#qbCalToday')?.addEventListener('click',()=>{state.qbCalendarOffset=0;renderCalendar()});
}

function qbHallMajorAchievements(){
  const major=state.quests.filter(q=>q.major_achievement).map(q=>{const c=state.completions.find(x=>!x.reversed_at&&x.quest_id===q.id);return c?{title:q.title,who:qbMemberName(c.subject_user_id||c.completed_by),date:qbCompletionDate(c)}:null}).filter(Boolean);
  return major;
}
const qbRenderHallBeforeV9=renderHall;
renderHall=function(){
  qbRenderHallBeforeV9();
  const major=qbHallMajorAchievements();if(!major.length)return;
  const section=document.createElement('section');section.className='card home-card qb-major-achievement-history';section.innerHTML=`<p class="eyebrow">✦ RECORDED FEATS</p><h2>Major Achievements</h2><div class="qb-history-list">${major.map(a=>`<div class="qb-history-row"><b>${esc(a.title)}</b><span>${esc(a.who)} · ${new Date(a.date+'T12:00:00').toLocaleDateString()}</span></div>`).join('')}</div>`;screen.appendChild(section);
};
