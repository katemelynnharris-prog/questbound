// === Questbound canonical pass 12: compact Journal dailies + training bars + Hall achievement details ===

function qbJournalDailySection(qs){
  const dailies=qs.filter(q=>(q.owner_type==='personal_daily'||(q.owner_type==='co-op'&&safeMeta(q.recurrence).type==='daily'))&&canOwnQuest(q));
  if(!dailies.length)return'';
  const done=dailies.filter(q=>isCompletedForCurrentOccurrence(q)).length;
  const rows=dailies.map(q=>{const completed=isCompletedForCurrentOccurrence(q),eligible=canOwnQuest(q),target=typeof qbCountTarget==='function'?qbCountTarget(q):1,current=target>1&&typeof qbDailyCount==='function'?qbDailyCount(q):completed?1:0,progress=target>1?`<span class="qb-daily-count">${Math.min(current,target)}/${target}</span>`:'',label=completed?'Done':target>1?`Log ${Math.min(current+1,target)}/${target}`:'Complete';return `<div class="qb-daily-row ${completed?'done':''}" data-quest-id="${q.id}"><div class="qb-daily-main"><b>${completed?'✓ ':''}${esc(q.title)}</b>${progress}<small>${esc(q.category)} · +${fmt(q.xp_personal)} XP${Number(q.xp_campaign||0)?` · +${fmt(q.xp_campaign)} Campaign`:''}</small></div><button class="mini" data-complete="${q.id}" data-source="journal" ${completed||!eligible?'disabled':''}>${label}</button></div>`}).join('');
  return `<section class="card home-card qb-daily-card qb-daily-compact qb-journal-dailies"><div class="card-head"><div><p class="eyebrow">☀ DAILY LEDGER</p><h2>Today</h2></div><span class="count-pill">${done} / ${dailies.length}</span></div><div class="qb-daily-compact-grid">${rows}</div></section>`;
}
function renderJournal(){
  const visible=state.quests.filter(q=>!q.hidden_encounter),cats=['All',...new Set(visible.map(q=>q.category))],qs=state.questFilter==='All'?visible:visible.filter(q=>q.category===state.questFilter),regular=qs.filter(q=>q.owner_type!=='personal_daily'&&!(q.owner_type==='co-op'&&safeMeta(q.recurrence).type==='daily'));
  screen.innerHTML=`<section class="ledger-head"><p class="eyebrow">THE GUILD LEDGER</p><h1>Quest Journal</h1><p>${fmt(visible.length)} active visible quests. Hidden surprise and secret subplot pools remain server-side.</p></section>${questWatchCard()}<div class="filterbar">${cats.map(c=>`<button class="${state.questFilter===c?'active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>${qbJournalDailySection(qs)}<div class="quest-list journal-list">${regular.map(q=>questRow(q)).join('')||(!qs.length?'<div class="empty-inline">No quests match this filter.</div>':'')}</div>`;
  screen.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.questFilter=b.dataset.filter;renderJournal()});wireQuestButtons();wireHomeButtons();qbWireActivityUndo();
}

function qbTrainingStatBars(){
  const s=state.trainingStats||{},defs=[['Strength','strength'],['Endurance','endurance'],['Agility','agility'],['Mobility','mobility'],['Core / Power','core_power'],['Grip / Climbing','grip_climbing']];
  return `<div class="qb-training-bars">${defs.map(([label,key])=>{const value=Math.max(0,Number(s[key]||0)),target=Math.max(10,Math.ceil((value+1)/10)*10),pct=Math.min(100,(value/target)*100);return `<div class="qb-training-stat"><div class="qb-training-stat-head"><span>${esc(label)}</span><b>${fmt(value)} / ${fmt(target)}</b></div><div class="progress slim"><span style="width:${pct}%"></span></div></div>`}).join('')}</div>`;
}
function qbEnhanceTrainingV12(){
  const record=[...screen.querySelectorAll('.card')].find(c=>/TRAINING RECORD/.test(c.textContent||''));if(!record)return;
  record.querySelector('.qb-mini-stats')?.remove();
  const sessions=record.querySelector('h2');if(sessions)sessions.insertAdjacentHTML('afterend',qbTrainingStatBars());else record.insertAdjacentHTML('beforeend',qbTrainingStatBars());
}
const qbRenderTrainingBeforeV12=renderTraining;
renderTraining=function(){qbRenderTrainingBeforeV12();qbEnhanceTrainingV12()};

function qbHallAchievementDetail(label){
  const archived=state.campaigns.filter(c=>c.status==='archived'||c.archived_at),fmtDate=d=>d?new Date(d).toLocaleDateString():'Unknown date';
  if(/Campaign (Victory|Victories)$/.test(label)){
    const names=archived.map(c=>`${c.name}${c.archived_at?` (${fmtDate(c.archived_at)})`:''}`);return {title:label,text:names.length?`Earned by completing ${archived.length} Guild Campaign${archived.length===1?'':'s'}: ${names.join(', ')}.`:'Earned by completing a Guild Campaign.'};
  }
  if(label==='First Expedition'){
    const list=(state.expeditions||[]).filter(e=>e.completed_at).sort((a,b)=>new Date(a.completed_at)-new Date(b.completed_at)),e=list[0];return {title:label,text:e?`Earned by completing your first expedition${e.title?` “${e.title}”`:''} on ${fmtDate(e.completed_at)}${Number(e.renown_awarded||e.renown)>0?` and earning ${fmt(e.renown_awarded||e.renown)} Renown`:''}.`:'Earned by completing the Guild’s first expedition.'};
  }
  if(label==='Seven-Day Road'){
    const reached=state.members.map(m=>({name:m.player_key,streak:playerStreak(m.user_id)})).filter(x=>x.streak>=7);return {title:label,text:reached.length?`Earned when ${reached.map(x=>`${x.name} reached a ${x.streak}-day questing streak`).join(' and ')}.`:'Earned when a Guild member reached a seven-day questing streak.'};
  }
  return {title:label,text:'This milestone records a notable Guild achievement in Questbound.'};
}
function qbEnhanceHallV12(){
  screen.querySelectorAll('.qb-achievement-grid').forEach(grid=>{[...grid.children].forEach(el=>{if(el.matches('button'))return;const label=(el.textContent||'').trim();if(!label||/will appear/i.test(label))return;const b=document.createElement('button');b.className='qb-achievement-button';b.dataset.qbHallAchievement=label;b.textContent=label;el.replaceWith(b)});});
  screen.querySelectorAll('[data-qb-hall-achievement]').forEach(b=>b.onclick=()=>{const d=qbHallAchievementDetail(b.dataset.qbHallAchievement);qbModal(`<p class="eyebrow">🏅 GUILD ACHIEVEMENT</p><h2>${esc(d.title)}</h2><p>${esc(d.text)}</p><button data-qb-modal-close>Close</button>`)});
  screen.querySelectorAll('.qb-major-achievement-history .qb-history-row').forEach(row=>{const title=(row.querySelector('b')?.textContent||'').trim();if(!title)return;row.classList.add('qb-clickable-history');row.setAttribute('role','button');row.tabIndex=0;const open=()=>{const q=state.quests.find(q=>q.title===title&&q.major_achievement),c=q?state.completions.find(x=>!x.reversed_at&&x.quest_id===q.id):null,who=c?qbMemberName(c.subject_user_id||c.completed_by):'Guild',date=c?(c.effective_date||localDate(new Date(c.completed_at))):null;const text=q?`${who} earned this recorded feat by completing “${q.title}”${q.objective?`: ${q.objective}`:''}${date?` on ${new Date(date+'T12:00:00').toLocaleDateString()}`:''}.`:'This is a recorded major Guild feat.';qbModal(`<p class="eyebrow">✦ RECORDED FEAT</p><h2>${esc(title)}</h2><p>${esc(text)}</p><button data-qb-modal-close>Close</button>`)};row.onclick=open;row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
}
const qbRenderHallBeforeV12=renderHall;
renderHall=function(){qbRenderHallBeforeV12();qbEnhanceHallV12()};
