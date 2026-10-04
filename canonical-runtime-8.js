// === Questbound V24 parity correction pass (runtime 8): canonical Quest Editor + schedule fidelity ===
async function loadQuests(){
  const fields='id,key,title,objective,flavor,category,owner_type,assignee_key,assigned_user_id,value_tier,xp_personal,xp_campaign,random_eligible,gauntlet_eligible,random_weight,random_rarity,visibility,recurrence,late_penalty,warning_days,notes,major_achievement,loot_policy,due_date,priority,hidden_encounter';
  const {data,error}=await sb.from('quest_templates').select(fields).eq('guild_id',state.membership.guild_id).eq('active',true).order('category').order('title');
  if(error)throw error;state.quests=data||[];
}

function recurrenceLabel(q){
  const r=safeMeta(q?.recurrence),t=r.type||'once';
  if(t==='daily')return qbCountTarget(q)>1?`Daily · ${qbCountTarget(q)} logs`:'Daily';
  if(t==='weekly')return `Weekly${Array.isArray(r.days)&&r.days.length?` · ${r.days.join(', ')}`:''}`;
  if(t==='monthly_fixed')return `Monthly · day ${r.day||1}`;
  if(t==='monthly_dates')return `Monthly · days ${(r.days||[]).join(', ')}`;
  if(t==='interval')return `Every ${r.count||1} ${r.unit||'days'}`;
  if(t==='frequency')return `${r.target||1}× / ${r.period||'month'}`;
  if(t==='seasonal')return `Seasonal · month ${r.month||'?'}`;
  if(t==='seasonal_wildcard')return 'Seasonal wildcard';
  if(t==='room_slots')return 'Rotating room objective';
  if(t==='repeatable')return 'Repeatable';
  return 'One-time objective';
}
function qbDaysBetween(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000)}
function questWatchItems(){
  const today=localDate(),priorityScore={low:0,normal:5,high:18,urgent:35};
  return state.quests.filter(q=>!q.hidden_encounter&&q.recurrence?.type!=='daily'&&q.owner_type!=='personal_daily'&&canOwnQuest(q)).map(q=>{
    const r=safeMeta(q.recurrence);let score=priorityScore[q.priority]||0,label=null;
    if(q.due_date){const days=qbDaysBetween(today,String(q.due_date).slice(0,10)),warn=Number(q.warning_days||0);if(days<0){score+=160+Math.min(30,Math.abs(days));label=`Overdue · ${Math.abs(days)}d`;}else if(days<=warn){score+=145-days*5;label=days===0?'Due today':`Due in ${days}d`;}else score=0;}
    else if(r.type==='monthly_fixed'){const day=Number(today.slice(8,10)),delta=Number(r.day||1)-day;if(delta>=0&&delta<=Math.max(7,Number(q.warning_days||0)))score+=100-delta*5;else score=0;}
    else if(r.type==='weekly')score+=75;
    else if(['interval','frequency'].includes(r.type))score+=35;
    return{q,score,label};
  }).filter(x=>x.score>0&&!isCompletedForCurrentOccurrence(x.q)).sort((a,b)=>b.score-a.score).slice(0,5);
}
function questWatchCard(){
  const rows=questWatchItems();
  return `<section class="card home-card"><p class="eyebrow">⏳ QUEST WATCH</p><h2>Deadlines & rhythms</h2><div class="watch-list">${rows.map(({q,label})=>`<div class="watch-row"><div><b>${esc(q.title)}</b><span>${esc(label||recurrenceLabel(q))} · ${esc(ownerLabel(q))}</span></div><button data-jumpquest="${q.id}" class="mini ghost">Journal</button></div>`).join('')||'<div class="empty-inline">No urgent visible quests right now.</div>'}</div></section>`;
}

function qbQuestDatesForMonth(q,year,month){
  const r=safeMeta(q.recurrence),out=[];
  if(q.due_date){const d=new Date(String(q.due_date).slice(0,10)+'T12:00:00');if(d.getFullYear()===year&&d.getMonth()+1===month)out.push(d.getDate())}
  if(r.type==='monthly_fixed'&&r.day)out.push(Number(r.day));
  if(r.type==='monthly_dates')out.push(...(r.days||[]).map(Number));
  if(r.type==='weekly'&&Array.isArray(r.days)){const names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];for(let day=1;day<=new Date(year,month,0).getDate();day++){const n=names[new Date(year,month-1,day).getDay()];if(r.days.includes(n))out.push(day)}}
  return [...new Set(out.filter(d=>d>=1&&d<=new Date(year,month,0).getDate()))];
}
function renderCalendar(){
  const [year,month]=localDate().split('-').map(Number),days=new Date(year,month,0).getDate(),first=new Date(year,month-1,1).getDay(),holidays=qbHolidays(year).filter(h=>h.month===month);
  const dated=state.quests.filter(q=>!q.hidden_encounter&&canOwnQuest(q)&&(q.due_date||['monthly_fixed','monthly_dates','weekly'].includes(safeMeta(q.recurrence).type))),events=new Map();
  const add=(d,x)=>{if(!events.has(d))events.set(d,[]);events.get(d).push(x)};holidays.forEach(h=>add(h.day,{type:'holiday',label:h.name}));dated.forEach(q=>qbQuestDatesForMonth(q,year,month).forEach(d=>add(d,{type:'quest',label:q.title,q})));
  const cells=[];for(let i=0;i<first;i++)cells.push('<div class="qb-cal-cell blank"></div>');for(let d=1;d<=days;d++){const es=events.get(d)||[],today=Number(localDate().slice(8,10))===d;cells.push(`<div class="qb-cal-cell ${today?'today':''}"><b>${d}</b>${es.slice(0,4).map(e=>`<span class="${e.type}">${esc(e.label)}</span>`).join('')}${es.length>4?`<small>+${es.length-4} more</small>`:''}</div>`)}
  const flexible=state.quests.filter(q=>!q.hidden_encounter&&['interval','frequency'].includes(safeMeta(q.recurrence).type)&&canOwnQuest(q));
  screen.innerHTML=`<section class="ledger-head"><p class="eyebrow">📅 GUILD CALENDAR</p><h1>${new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(year,month-1,1))}</h1><p>Fixed obligations and explicit due dates appear on their real dates. Hidden/seasonal Random encounters stay off the calendar so they remain surprises.</p></section><div class="qb-calendar-layout"><section class="card qb-calendar-card"><div class="qb-cal-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<span>${x}</span>`).join('')}</div><div class="qb-cal-grid">${cells.join('')}</div><div class="qb-calendar-legend"><span class="holiday">Holiday</span><span class="quest">Quest / obligation</span></div></section><div class="qb-calendar-side"><section class="card"><p class="eyebrow">🎉 HOLIDAYS & OBSERVANCES</p><div class="qb-history-list">${holidays.map(h=>`<div class="qb-history-row"><b>${esc(h.name)}</b><span>${month}/${h.day}</span></div>`).join('')||'<div class="empty-inline">No listed holidays this month.</div>'}</div></section><section class="card"><p class="eyebrow">THE ROAD AHEAD</p><div class="qb-history-list">${flexible.slice(0,12).map(q=>`<div class="qb-history-row"><b>${esc(q.title)}</b><span>${esc(recurrenceLabel(q))}</span></div>`).join('')||'<div class="empty-inline">No flexible recurring quests.</div>'}</div></section></div></div>`;
}

const qbRenderJournalBeforeV8=renderJournal;
renderJournal=function(){const all=state.quests;state.quests=all.filter(q=>!q.hidden_encounter);try{qbRenderJournalBeforeV8()}finally{state.quests=all}};

function qbQuestEditor(id){
  const q=id?questById(id):null,r=safeMeta(q?.recurrence),type=r.type||'once',owner=q?.owner_type||'shared',assignee=q?.assignee_key||'';
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  qbModal(`<p class="eyebrow">${q?'EDIT QUEST':'NEW QUEST'}</p><h2>${q?esc(q.title):'Add to the Guild Ledger'}</h2><form id="qbQuestForm" class="qb-quest-form qb-readable-editor">
    <label>Title<input id="qeTitle" required value="${esc(q?.title||'')}"></label><label>Category<input id="qeCategory" required value="${esc(q?.category||'Tasks')}"></label>
    <label>Ownership<select id="qeOwner">${['shared','co-op','personal_daily','individual'].map(x=>`<option value="${x}" ${owner===x?'selected':''}>${x==='personal_daily'?'Personal Daily':x==='co-op'?'Co-op':x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label>
    <label>Assignee<select id="qeAssignee"><option value="">None</option>${state.members.map(m=>`<option ${assignee===m.player_key?'selected':''}>${esc(m.player_key)}</option>`).join('')}</select></label>
    <label>Value tier<select id="qeTier">${['Low','Medium','High'].map(x=>`<option ${String(q?.value_tier||'Medium').toLowerCase()===x.toLowerCase()?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Priority<select id="qePriority">${['low','normal','high','urgent'].map(x=>`<option ${String(q?.priority||'normal')===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Personal XP<input id="qePxp" type="number" min="0" value="${Number(q?.xp_personal??100)}"></label><label>Campaign XP<input id="qeCxp" type="number" min="0" value="${Number(q?.xp_campaign??25)}"></label>
    <label>Deadline / due date<input id="qeDue" type="date" value="${q?.due_date?String(q.due_date).slice(0,10):''}"></label><label>Warning days<input id="qeWarning" type="number" min="0" max="60" value="${Number(q?.warning_days||0)}"></label>
    <label>Recurrence<select id="qeRecType"><option value="once" ${type==='once'?'selected':''}>One time</option><option value="daily" ${type==='daily'?'selected':''}>Daily</option><option value="weekly" ${type==='weekly'?'selected':''}>Weekly</option><option value="monthly_fixed" ${type==='monthly_fixed'?'selected':''}>Monthly — one date</option><option value="monthly_dates" ${type==='monthly_dates'?'selected':''}>Monthly — multiple dates</option><option value="interval" ${type==='interval'?'selected':''}>Every X days/weeks/months</option><option value="frequency" ${type==='frequency'?'selected':''}>Target X times per period</option><option value="seasonal" ${type==='seasonal'?'selected':''}>Seasonal month</option></select></label>
    <label data-qe-detail="daily">Daily logs needed<input id="qeCountTarget" type="number" min="1" max="12" value="${Number(r.count_target||1)}"></label>
    <label data-qe-detail="weekly" class="wide">Weekly days<select id="qeWeekDays" multiple size="4">${dayNames.map(x=>`<option ${Array.isArray(r.days)&&r.days.includes(x)?'selected':''}>${x}</option>`).join('')}</select><small>Use Ctrl/Cmd to select multiple days.</small></label>
    <label data-qe-detail="monthly_fixed">Day of month<input id="qeMonthDay" type="number" min="1" max="31" value="${Number(r.day||1)}"></label>
    <label data-qe-detail="monthly_dates">Monthly dates<input id="qeMonthDates" value="${esc((r.days||[]).join(', '))}" placeholder="1, 15"></label>
    <label data-qe-detail="interval">Every<input id="qeIntervalCount" type="number" min="1" value="${Number(r.count||1)}"></label><label data-qe-detail="interval">Interval unit<select id="qeIntervalUnit">${['days','weeks','months'].map(x=>`<option ${r.unit===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label data-qe-detail="frequency">Target count<input id="qeFreqTarget" type="number" min="1" value="${Number(r.target||1)}"></label><label data-qe-detail="frequency">Period<select id="qeFreqPeriod">${['month','quarter','year'].map(x=>`<option ${r.period===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label data-qe-detail="seasonal">Season month<input id="qeSeasonMonth" type="number" min="1" max="12" value="${Number(r.month||10)}"></label>
    <label class="wide">Objective<textarea id="qeObjective">${esc(q?.objective||'')}</textarea></label><label class="wide">Flavor / narrative<textarea id="qeFlavor">${esc(q?.flavor||'')}</textarea></label>
    <label class="check"><input id="qeRandom" type="checkbox" ${q?.random_eligible?'checked':''}> Random Sidequest eligible</label><label class="check"><input id="qeGauntlet" type="checkbox" ${q?.gauntlet_eligible!==false?'checked':''}> Gauntlet eligible</label><label class="check"><input id="qeHidden" type="checkbox" ${q?.hidden_encounter?'checked':''}> Hidden Random Encounter</label><label class="check"><input id="qeMajor" type="checkbox" ${q?.major_achievement?'checked':''}> Major achievement</label>
    <div class="wide qb-editor-note"><b>One canonical quest record</b><span>These settings feed Journal, Calendar, Quest Watch, Random Sidequests, Gauntlets, recurrence, rewards, and Activity.</span></div>
    <div class="wide qb-inline-actions"><button type="submit">Save Quest</button>${q?'<button type="button" id="qeArchive" class="ghost danger">Archive Quest</button>':''}<button type="button" data-qb-modal-close class="ghost">Cancel</button></div></form>`);
  const rec=document.querySelector('#qeRecType'),toggle=()=>{const t=rec.value;document.querySelectorAll('[data-qe-detail]').forEach(el=>el.classList.toggle('qb-field-hidden',el.dataset.qeDetail!==t))};rec.onchange=toggle;toggle();
  document.querySelector('#qeOwner').onchange=e=>document.querySelector('#qeAssignee').disabled=e.target.value!=='individual';document.querySelector('#qeAssignee').disabled=owner!=='individual';
  document.querySelector('#qeHidden').onchange=e=>{if(e.target.checked)document.querySelector('#qeRandom').checked=true};
  document.querySelector('#qbQuestForm').onsubmit=async e=>{e.preventDefault();const rt=rec.value;let recurrence={type:rt};
    if(rt==='daily')recurrence.count_target=Math.max(1,Number(document.querySelector('#qeCountTarget').value)||1);
    if(rt==='weekly')recurrence.days=[...document.querySelector('#qeWeekDays').selectedOptions].map(x=>x.value);
    if(rt==='monthly_fixed')recurrence.day=Math.max(1,Math.min(31,Number(document.querySelector('#qeMonthDay').value)||1));
    if(rt==='monthly_dates')recurrence.days=[...new Set(document.querySelector('#qeMonthDates').value.split(',').map(x=>Number(x.trim())).filter(x=>x>=1&&x<=31))].sort((a,b)=>a-b);
    if(rt==='interval'){recurrence.count=Math.max(1,Number(document.querySelector('#qeIntervalCount').value)||1);recurrence.unit=document.querySelector('#qeIntervalUnit').value;recurrence.anchor='last_completion'}
    if(rt==='frequency'){recurrence.target=Math.max(1,Number(document.querySelector('#qeFreqTarget').value)||1);recurrence.period=document.querySelector('#qeFreqPeriod').value}
    if(rt==='seasonal')recurrence.month=Math.max(1,Math.min(12,Number(document.querySelector('#qeSeasonMonth').value)||10));
    const ownerType=document.querySelector('#qeOwner').value,assigneeKey=document.querySelector('#qeAssignee').value||null,member=assigneeKey?memberByKey(assigneeKey):null,hidden=document.querySelector('#qeHidden').checked;
    const payload={title:document.querySelector('#qeTitle').value.trim(),objective:document.querySelector('#qeObjective').value.trim(),flavor:document.querySelector('#qeFlavor').value.trim(),category:document.querySelector('#qeCategory').value.trim()||'Tasks',owner_type:ownerType,assignee_key:ownerType==='individual'?assigneeKey:null,assigned_user_id:ownerType==='individual'?member?.user_id||null:null,value_tier:document.querySelector('#qeTier').value.toLowerCase(),xp_personal:Math.max(0,Number(document.querySelector('#qePxp').value)||0),xp_campaign:Math.max(0,Number(document.querySelector('#qeCxp').value)||0),random_eligible:hidden||document.querySelector('#qeRandom').checked,gauntlet_eligible:document.querySelector('#qeGauntlet').checked,hidden_encounter:hidden,major_achievement:document.querySelector('#qeMajor').checked,recurrence,due_date:document.querySelector('#qeDue').value||null,warning_days:Math.max(0,Number(document.querySelector('#qeWarning').value)||0),priority:document.querySelector('#qePriority').value,visibility:'guild',updated_at:new Date().toISOString()};
    let res;if(q)res=await sb.from('quest_templates').update(payload).eq('id',q.id);else{payload.guild_id=state.membership.guild_id;payload.key=`${qbSlug(payload.title)}-${Date.now().toString(36).slice(-4)}`;payload.created_by=ownUserId();payload.active=true;res=await sb.from('quest_templates').insert(payload)}
    if(res.error)return alert(res.error.message);document.querySelector('.qb-modal')?.remove();await loadQuests();renderAdmin();showToast(q?'Quest updated.':'Quest added.');
  };
  document.querySelector('#qeArchive')?.addEventListener('click',async()=>{if(!confirm(`Archive ${q.title}?`))return;const {error}=await sb.from('quest_templates').update({active:false,updated_at:new Date().toISOString()}).eq('id',q.id);if(error)return alert(error.message);document.querySelector('.qb-modal')?.remove();await loadQuests();renderAdmin();showToast('Quest archived.')});
}
