// === Questbound canonical pass 12: compact Journal dailies + training bars + Hall achievement details ===

function qbJournalDailySection(qs){
  const dailies=qs.filter(q=>(q.owner_type==='personal_daily'||(q.owner_type==='co-op'&&safeMeta(q.recurrence).type==='daily'))&&canOwnQuest(q));
  if(!dailies.length)return'';
  const done=dailies.filter(q=>isCompletedForCurrentOccurrence(q)).length;
  const rows=dailies.map(q=>{const completed=isCompletedForCurrentOccurrence(q),eligible=canOwnQuest(q),target=typeof qbCountTarget==='function'?qbCountTarget(q):1,current=target>1&&typeof qbDailyCount==='function'?qbDailyCount(q):completed?1:0,progress=target>1?`<span class="qb-daily-count">${Math.min(current,target)}/${target}</span>`:'',label=completed?'Done':target>1?`Log ${Math.min(current+1,target)}/${target}`:'Complete';return `<div class="qb-daily-row ${completed?'done':''}" data-quest-id="${q.id}"><div class="qb-daily-main"><b>${completed?'✓ ':''}${esc(q.title)}</b>${progress}<small>${esc(q.category)} · +${fmt(q.xp_personal)} XP${Number(q.xp_campaign||0)?` · +${fmt(q.xp_campaign)} Campaign`:''}</small></div><button class="mini" data-complete="${q.id}" data-source="journal" ${completed||!eligible?'disabled':''}>${label}</button></div>`}).join('');
  return `<section class="card home-card qb-daily-card qb-daily-compact qb-journal-dailies"><div class="card-head"><div><p class="eyebrow">☀ DAILY LEDGER</p><h2>Today</h2></div><span class="count-pill">${done} / ${dailies.length}</span></div><div class="qb-daily-compact-grid">${rows}</div></section>`;
}
function qbJournalArchived(q){
  return safeMeta(q.recurrence).type==='once'&&isCompletedForCurrentOccurrence(q);
}
function qbJournalMatches(q,query){
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text=[q.title,q.category,q.objective,ownerLabel(q)].join(' ').toLocaleLowerCase();
  return words.every(word=>text.includes(word));
}
function renderJournal(){
  const previousCategoryBar=screen.querySelector('.qb-quest-category-filters');
  const categoryScroll=previousCategoryBar?.scrollLeft||0;
  const focusedCategory=previousCategoryBar?.contains(document.activeElement)?document.activeElement.dataset.filter:null;
  const visible=state.quests.filter(q=>!q.hidden_encounter&&q.key!=='no-overspending-week');
  const archived=visible.filter(q=>qbJournalArchived(q)),active=visible.filter(q=>!qbJournalArchived(q));
  const archiveView=state.questJournalView==='archive',pool=archiveView?archived:active;
  const cats=['All',...new Set(pool.map(q=>q.category))];
  if(!cats.includes(state.questFilter))state.questFilter='All';
  const search=state.questSearch||'';
  const qs=pool.filter(q=>(state.questFilter==='All'||q.category===state.questFilter)&&qbJournalMatches(q,search));
  const regular=archiveView?qs:qs.filter(q=>!qbIsDailyLedgerQuestV20(q));
  screen.innerHTML=`<section class="ledger-head"><p class="eyebrow">THE GUILD LEDGER</p><h1>Quest Journal</h1><p>Completed one-time quests move into the archive automatically.</p></section><div class="qb-journal-controls"><div class="filterbar qb-journal-views" aria-label="Journal view"><button data-journal-view="active" class="${!archiveView?'active':''}" aria-pressed="${!archiveView}">Current quests (${active.length})</button><button data-journal-view="archive" class="${archiveView?'active':''}" aria-pressed="${archiveView}">Completed archive (${archived.length})</button></div><label class="qb-journal-search" for="qbJournalSearch">Search quests<input id="qbJournalSearch" type="search" placeholder="Title, category, player, or objective…" value="${esc(search)}" autocomplete="off"></label></div>${!archiveView&&!search.trim()?questWatchCard():''}<div class="filterbar qb-quest-category-filters" role="group" aria-label="Quest category">${cats.map(c=>`<button type="button" class="${state.questFilter===c?'active':''}" data-filter="${esc(c)}" aria-pressed="${state.questFilter===c}">${esc(c)}</button>`).join('')}</div><p class="fine" role="status">${esc(state.questFilter)} · ${qs.length} quest${qs.length===1?'':'s'} shown${archiveView?' · Completed one-time tasks':''}</p>${archiveView?'':qbJournalDailySection(qs)}<div class="quest-list journal-list">${regular.map(q=>questRow(q)).join('')||(!qs.length?`<div class="empty-inline">${search.trim()?'No quests match your search.':archiveView?'No completed one-time quests here yet.':'No quests match this filter.'}</div>`:'')}</div>`;
  screen.querySelectorAll('[data-journal-view]').forEach(b=>b.onclick=()=>{state.questJournalView=b.dataset.journalView;state.questFilter='All';renderJournal()});
  const categoryBar=screen.querySelector('.qb-quest-category-filters');
  categoryBar.scrollLeft=categoryScroll;
  const categoryButtons=[...categoryBar.querySelectorAll('[data-filter]')];
  categoryButtons.forEach(b=>{
    const selected=b.dataset.filter===state.questFilter;
    b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
    b.onclick=()=>{state.questFilter=b.dataset.filter;renderJournal()};
  });
  if(focusedCategory)categoryButtons.find(b=>b.dataset.filter===focusedCategory)?.focus({preventScroll:true});
  requestAnimationFrame(()=>{
    if(!categoryBar.isConnected)return;
    const selected=categoryButtons.find(b=>b.dataset.filter===state.questFilter);if(!selected)return;
    const bar=categoryBar.getBoundingClientRect(),button=selected.getBoundingClientRect();
    if(button.left<bar.left+8)categoryBar.scrollLeft-=bar.left+8-button.left;
    else if(button.right>bar.right-8)categoryBar.scrollLeft+=button.right-bar.right+8;
  });
  screen.querySelector('#qbJournalSearch')?.addEventListener('input',e=>{
    const value=e.currentTarget.value,position=e.currentTarget.selectionStart;
    state.questSearch=value;renderJournal();
    const input=screen.querySelector('#qbJournalSearch');input?.focus();
    if(input&&position!==null)input.setSelectionRange(position,position);
  });
  wireQuestButtons();wireHomeButtons();qbWireActivityUndo();
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
