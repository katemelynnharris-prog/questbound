// === Questbound canonical pass 20: Rider's Quadrant visual scoping only ===
// Adds visual hook classes and visual title replacement only. No behavior, state, data, navigation, or calculations are changed.

function qbApplyRidersQuadrantVisualV20(){
  const isRiders=typeof trainingLabel==='function' && trainingLabel()==="Rider's Quadrant" && state.tab==="Rider's Quadrant";
  screen.classList.toggle('qb-riders-quadrant',isRiders);
  screen.querySelectorAll('.qb-riders-frame').forEach(el=>el.classList.remove('qb-riders-frame'));
  screen.querySelectorAll('.qb-riders-title-text').forEach(el=>el.classList.remove('qb-riders-title-text'));
  screen.querySelectorAll('.qb-riders-title-image').forEach(el=>{if(!isRiders)el.remove()});
  if(!isRiders)return;

  const hero=screen.querySelector('.training-hero') || screen.querySelector('.card');
  if(hero)hero.classList.add('qb-riders-frame');
  if(!hero)return;

  const title=[...hero.querySelectorAll('h1,h2')].find(el=>String(el.textContent||'').trim()==="Rider's Quadrant") || hero.querySelector('h1');
  if(!title)return;
  title.classList.add('qb-riders-title-text');

  let img=hero.querySelector('.qb-riders-title-image');
  if(!img){
    img=document.createElement('img');
    img.className='qb-riders-title-image';
    img.alt="Rider's Quadrant";
    img.src='./assets/Riders%E2%80%99%20Quadrant%20Engraved%20Crest.png?v=20.9';
    title.insertAdjacentElement('afterend',img);
  }
}

const qbRenderTrainingBeforeV20=renderTraining;
renderTraining=function(){
  qbRenderTrainingBeforeV20();
  qbApplyRidersQuadrantVisualV20();
};

const qbRenderBeforeV20=render;
render=function(){
  const out=qbRenderBeforeV20();
  qbApplyRidersQuadrantVisualV20();
  return out;
};


/* Final daily-ledger compatibility pass: ensure shared daily quests such as Walk Arthur
   render in both Home and Journal daily sections, after all earlier renderer overrides. */
function qbIsDailyLedgerQuestV20(q){
  const r=safeMeta(q?.recurrence);
  return q && canOwnQuest(q) && (
    q.owner_type==='personal_daily' ||
    (q.owner_type==='co-op' && r.type==='daily') ||
    q.key==='walk-arthur'
  );
}
function qbDailyCountV20(q,date=localDate()){
  if(!q)return 0;
  return state.completions.filter(c=>!c.reversed_at && c.quest_id===q.id && qbCompletionDate(c)===date && (q.owner_type==='co-op' || q.key==='walk-arthur' || c.subject_user_id===ownUserId())).length;
}
function permanentDailyCard(){
  const qs=state.quests.filter(qbIsDailyLedgerQuestV20),done=qs.filter(q=>isCompletedForCurrentOccurrence(q)).length;
  const rows=qs.map(q=>{const completed=isCompletedForCurrentOccurrence(q),eligible=canOwnQuest(q),target=typeof qbCountTarget==='function'?qbCountTarget(q):1,current=target>1?qbDailyCountV20(q):completed?1:0,progress=target>1?`<span class="qb-daily-count">${Math.min(current,target)}/${target}</span>`:'',label=completed?'Done':target>1?`Log ${Math.min(current+1,target)}/${target}`:'Complete';return `<div class="qb-daily-row ${completed?'done':''}"><div class="qb-daily-main"><b>${completed?'✓ ':''}${esc(q.title)}</b>${progress}<small>+${fmt(q.xp_personal)} XP${Number(q.xp_campaign||0)?` · +${fmt(q.xp_campaign)} Campaign`:''}</small></div><button class="mini" data-complete="${q.id}" data-source="journal" ${completed||!eligible?'disabled':''}>${label}</button></div>`}).join('');
  return `<section class="card home-card qb-daily-card qb-daily-compact"><div class="card-head"><div><p class="eyebrow">☀ DAILY LEDGER</p><h2>Today</h2></div><span class="count-pill">${done} / ${qs.length}</span></div><div class="qb-daily-compact-grid">${rows||'<div class="empty-inline">No daily quests are visible.</div>'}</div></section>`;
}
function qbJournalDailySection(qs){
  const dailies=qs.filter(qbIsDailyLedgerQuestV20);
  if(!dailies.length)return'';
  const done=dailies.filter(q=>isCompletedForCurrentOccurrence(q)).length;
  const rows=dailies.map(q=>{const completed=isCompletedForCurrentOccurrence(q),eligible=canOwnQuest(q),target=typeof qbCountTarget==='function'?qbCountTarget(q):1,current=target>1?qbDailyCountV20(q):completed?1:0,progress=target>1?`<span class="qb-daily-count">${Math.min(current,target)}/${target}</span>`:'',label=completed?'Done':target>1?`Log ${Math.min(current+1,target)}/${target}`:'Complete';return `<div class="qb-daily-row ${completed?'done':''}" data-quest-id="${q.id}"><div class="qb-daily-main"><b>${completed?'✓ ':''}${esc(q.title)}</b>${progress}<small>${esc(q.category)} · +${fmt(q.xp_personal)} XP${Number(q.xp_campaign||0)?` · +${fmt(q.xp_campaign)} Campaign`:''}</small></div><button class="mini" data-complete="${q.id}" data-source="journal" ${completed||!eligible?'disabled':''}>${label}</button></div>`}).join('');
  return `<section class="card home-card qb-daily-card qb-daily-compact qb-journal-dailies"><div class="card-head"><div><p class="eyebrow">☀ DAILY LEDGER</p><h2>Today</h2></div><span class="count-pill">${done} / ${dailies.length}</span></div><div class="qb-daily-compact-grid">${rows}</div></section>`;
}
