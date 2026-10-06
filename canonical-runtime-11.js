// === Questbound canonical pass 11: compact daily loop + usable history ===

function qbActivityRows(list){
  return (list||[]).map(a=>{
    const actor=qbMemberName(a.actor_user_id),target=a.target_user_id&&a.target_user_id!==a.actor_user_id?` → ${qbMemberName(a.target_user_id)}`:'',m=safeMeta(a.metadata),completion=m.completion_id,trainingId=m.training_assignment_id;
    const questCanUndo=a.event_type==='quest_complete'&&a.actor_user_id===ownUserId()&&completion&&!state.completions.find(c=>c.id===completion)?.reversed_at;
    const trainingCanUndo=a.event_type==='training_complete'&&a.actor_user_id===ownUserId()&&trainingId&&state.training.some(t=>t.id===trainingId&&t.completed_at);
    return `<div class="activity-row qb-activity-row"><div><b>${esc(actor+target)} · ${esc(a.message||a.event_type)}</b>${m.fate?`<span class="fate-used">🃏 ${esc(m.fate)}</span>`:''}<small>${new Date(a.created_at).toLocaleString()}${a.personal_xp?` · ${a.personal_xp>0?'+':''}${a.personal_xp} XP`:''}${a.campaign_xp?` · ${a.campaign_xp>0?'+':''}${a.campaign_xp} Campaign`:''}</small></div>${questCanUndo?`<button class="mini ghost" data-qb-undo-quest="${completion}">Undo</button>`:trainingCanUndo?`<button class="mini ghost" data-qb-undo-training="${trainingId}">Undo</button>`:''}</div>`;
  }).join('')||'<div class="empty-inline">No Guild activity yet.</div>';
}
function activityList(limit=30){return `<div class="activity qb-activity-scroll">${qbActivityRows(state.activity.slice(0,limit))}</div>`}

function permanentDailyCard(){
  const qs=state.quests.filter(q=>(q.owner_type==='personal_daily'||(q.owner_type==='co-op'&&safeMeta(q.recurrence).type==='daily'))&&canOwnQuest(q)),done=qs.filter(q=>isCompletedForCurrentOccurrence(q)).length;
  const rows=qs.map(q=>{const completed=isCompletedForCurrentOccurrence(q),eligible=canOwnQuest(q),target=typeof qbCountTarget==='function'?qbCountTarget(q):1,current=target>1&&typeof qbDailyCount==='function'?qbDailyCount(q):completed?1:0,progress=target>1?`<span class="qb-daily-count">${Math.min(current,target)}/${target}</span>`:'',label=completed?'Done':target>1?`Log ${Math.min(current+1,target)}/${target}`:'Complete';return `<div class="qb-daily-row ${completed?'done':''}"><div class="qb-daily-main"><b>${completed?'✓ ':''}${esc(q.title)}</b>${progress}<small>+${fmt(q.xp_personal)} XP${Number(q.xp_campaign||0)?` · +${fmt(q.xp_campaign)} Campaign`:''}</small></div><button class="mini" data-complete="${q.id}" data-source="journal" ${completed||!eligible?'disabled':''}>${label}</button></div>`}).join('');
  return `<section class="card home-card qb-daily-card qb-daily-compact"><div class="card-head"><div><p class="eyebrow">☀ DAILY LEDGER</p><h2>Today</h2></div><span class="count-pill">${done} / ${qs.length}</span></div><div class="qb-daily-compact-grid">${rows||'<div class="empty-inline">No personal dailies are visible.</div>'}</div></section>`;
}

function qbHomeTreasuryQuickCard(){
  const t=state.treasury;if(!t)return `<p class="eyebrow">💰 GUILD TREASURY</p><h2>No active fund</h2>`;
  const pct=progressPct(t.balance,t.target_amount);
  return `<div class="card-head"><div><p class="eyebrow">💰 GUILD TREASURY</p><h2>${esc(t.name)}</h2></div><b>${money(t.balance)} / ${money(t.target_amount)} Gold</b></div><div class="progress"><span style="width:${pct}%"></span></div><div class="qb-home-treasury-quick"><input id="qbHomeTreasuryAmount" type="number" min="0.01" step="0.01" placeholder="Amount"><button id="qbHomeDeposit" class="mini">＋ Add</button><select id="qbHomeWithdrawReason" aria-label="Withdrawal reason"><option value="INTENDED PURPOSE">Intended Purpose</option><option value="EMERGENCY">Emergency</option><option value="FLAMBOYANT">Flamboyant</option></select><button id="qbHomeWithdraw" class="mini ghost">− Subtract</button></div>`;
}
function qbWireHomeTreasury(){
  document.querySelector('#qbHomeDeposit')?.addEventListener('click',async()=>{const a=Number(document.querySelector('#qbHomeTreasuryAmount')?.value);if(!(a>0))return;const {error}=await sb.rpc('treasury_deposit',{p_amount:a});if(error)return alert(error.message);showToast(`＋ ${money(a)} Gold added`);await Promise.all([loadTreasury(),loadActivity()]);await loadTreasuryTransactions();renderHome()});
  document.querySelector('#qbHomeWithdraw')?.addEventListener('click',async()=>{const a=Number(document.querySelector('#qbHomeTreasuryAmount')?.value),reason=document.querySelector('#qbHomeWithdrawReason')?.value||'INTENDED PURPOSE';if(!(a>0))return;const {error}=await sb.rpc('treasury_withdraw',{p_amount:a,p_reason:reason});if(error)return alert(error.message);showToast(`− ${money(a)} Gold withdrawn`);await Promise.all([loadTreasury(),loadGuildItems(),loadActivity()]);await loadTreasuryTransactions();renderHome()});
}

function qbAchievementDetail(label,uid,progress){
  const mine=state.completions.filter(c=>!c.reversed_at&&(c.completed_by===uid||c.subject_user_id===uid)).sort((a,b)=>new Date(a.completed_at)-new Date(b.completed_at)),first=mine[0],fmtDate=d=>d?new Date(d).toLocaleDateString():'Unknown date';
  if(label==='First Quest'){const q=first?questById(first.quest_id):null;return {title:label,text:first?`Earned by completing ${q?.title||'your first quest'} on ${fmtDate(first.completed_at)}.`:'Earned by completing your first quest.'}}
  if(label==='Training Begun'){const e=state.activity.filter(a=>a.event_type==='training_complete'&&(a.actor_user_id===uid||a.target_user_id===uid)).at(-1);return {title:label,text:e?`Earned when you completed your first recorded training session on ${fmtDate(e.created_at)}.`:'Earned by completing your first recorded training session.'}}
  if(label==='Beyond the Keep'){const e=state.activity.filter(a=>a.event_type==='expedition'&&(a.actor_user_id===uid||a.target_user_id===uid)).at(-1);return {title:label,text:e?`Earned through exploration: ${e.message} (${fmtDate(e.created_at)}).`:'Earned by gaining Renown through exploration.'}}
  const ranks={'Cadet Rank':5,'Crawler Rank':10,'Rider Rank':15,'Pathfinder Rank':20,'Witcher Rank':25,'Champion Rank':30};if(ranks[label])return {title:label,text:`Earned by reaching Level ${ranks[label]}. Your current level is ${Number(progress?.level||1)}.`};
  if(label==='Campaign Victor'){const c=state.campaigns.find(c=>c.status==='archived');return {title:label,text:c?`Earned by finishing the Guild Campaign “${c.name}”.`:'Earned by completing a Guild Campaign.'}}
  const q=state.quests.find(q=>q.title===label&&q.major_achievement),c=q?mine.find(x=>x.quest_id===q.id):null;if(q)return {title:label,text:`Earned by completing “${q.title}”${q.objective?`: ${q.objective}`:''}${c?` on ${fmtDate(c.completed_at)}`:''}.`};
  return {title:label,text:'This achievement records a milestone you reached in Questbound.'};
}
function qbEnhanceCharacterV11(){
  const {uid,progress}=selectedCharacter();
  const grid=screen.querySelector('.qb-achievement-grid');if(grid){[...grid.children].forEach(el=>{const label=(el.textContent||'').trim();const b=document.createElement('button');b.className='qb-achievement-button';b.dataset.qbAchievement=label;b.textContent=label;el.replaceWith(b)});grid.querySelectorAll('[data-qb-achievement]').forEach(b=>b.onclick=()=>{const d=qbAchievementDetail(b.dataset.qbAchievement,uid,progress);qbModal(`<p class="eyebrow">🏆 ACHIEVEMENT</p><h2>${esc(d.title)}</h2><p>${esc(d.text)}</p><button data-qb-modal-close>Close</button>`)});}
  const history=[...screen.querySelectorAll('.qb-panel')].find(x=>/RECENT HISTORY/.test(x.textContent||''));if(history){const list=state.activity.filter(a=>a.actor_user_id===uid||a.target_user_id===uid).slice(0,30);history.innerHTML=`<p class="eyebrow">📖 RECENT HISTORY</p><div class="activity qb-activity-scroll">${qbActivityRows(list)}</div>`;}
  qbWireActivityUndo();
}

const qbRenderCharacterBeforeV11=renderCharacter;
renderCharacter=function(){qbRenderCharacterBeforeV11();qbEnhanceCharacterV11()};

const qbRenderHomeBeforeV11=renderHome;
renderHome=function(){
  qbRenderHomeBeforeV11();
  const treasury=[...screen.querySelectorAll('.card')].find(c=>/GUILD TREASURY/.test(c.querySelector('.eyebrow')?.textContent||''));if(treasury){treasury.classList.add('qb-home-treasury');treasury.innerHTML=qbHomeTreasuryQuickCard()}
  qbWireHomeTreasury();wireQuestButtons();qbWireActivityUndo();
};
