// Shared budget week: seven daily records, a single weekly claim, and weekly streaks.
async function loadBudgetWeek(){
  const {data,error}=await sb.rpc('budget_week_state');
  if(error){state.budgetWeek=null;throw error;}state.budgetWeek=data;
}
const qbLoadAllBeforeBudget=loadAll;
loadAll=async function(){await qbLoadAllBeforeBudget();await loadBudgetWeek()};
function qbBudgetDate(week,index){const d=new Date(week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+index);return d.toISOString().slice(0,10)}
function qbBudgetBlock(q){
  const b=state.budgetWeek;
  if(!b)return '<div class="weekly-block qb-budget"><p class="eyebrow">💰 WEEKLY CO-OP</p><h2>Stay within budget</h2><p>Budget tracker is unavailable. Refresh to try again.</p></div>';
  const labels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const days=labels.map((label,i)=>{
    const date=qbBudgetDate(b.week_key,i),status=b.days?.[date]||'pending',future=date>b.today,locked=future||b.claimed;
    const icon=status==='success'?'✓':status==='overspent'?'×':future?'·':'○';
    return `<button class="qb-budget-day ${status} ${date===b.today?'today':''}" data-budget-day="${date}" ${locked?'disabled':''} aria-label="${label}, ${date}: ${future?'upcoming':status}" title="${future?'Future day':b.claimed?'Week secured':status==='pending'?'Mark successful':'Edit day'}"><span>${label}</span><strong>${icon}</strong><small>${Number(date.slice(8))}</small></button>`;
  }).join('');
  const status=b.claimed?'✓ Week secured':b.failed?'Week failed · overspending recorded':`${b.successful_days} / 7 successful days`;
  return `<div class="weekly-block qb-budget"><p class="eyebrow">💰 WEEKLY CO-OP</p><h2>${esc(q.title)}</h2><p>One shared household record. Mark each day you stayed within your spending plan.</p><div class="qb-budget-stats"><span><b>${b.streak}</b> week streak</span><span><b>${b.best_streak}</b> best streak</span></div><div class="qb-budget-days">${days}</div><div class="progress-meta"><b>${status}</b><span>Resets Monday</span></div><div class="quest-meta">+${fmt(q.xp_personal)} Personal XP each · +${fmt(q.xp_campaign)} Campaign XP for a successful week</div><div class="qb-inline-actions"><button data-budget-claim ${!b.claimable?'disabled':''}>${b.claimed?'✓ Week Secured':'Claim Weekly Reward'}</button><button data-budget-overspent class="ghost danger" ${b.claimed?'disabled':''}>Record Overspending</button></div><p class="fine">Click an unmarked day to mark success; click a marked day to correct it. Future days are locked. Overspending applies −50 Campaign XP once for the week. Correcting the last overspent day restores the deducted XP. Claiming the reward locks this week’s entries.</p></div>`;
}
const qbWeeklyRoadBeforeBudget=weeklyRoadCard;
weeklyRoadCard=function(){
  const html=qbWeeklyRoadBeforeBudget(),q=state.quests.find(x=>x.key==='no-overspending-week');
  const start=html.indexOf('<div class="weekly-block"><p class="eyebrow">💰');
  return q&&start>=0?html.slice(0,start)+qbBudgetBlock(q)+'</section>':html;
};
let qbBudgetSaving=false;
async function qbSaveBudgetDay(date,status){
  if(qbBudgetSaving)return;qbBudgetSaving=true;
  screen.querySelectorAll('[data-budget-day],[data-budget-claim],[data-budget-overspent]').forEach(b=>b.disabled=true);
  try{
    const {data,error}=await sb.rpc('record_budget_day',{p_day:date,p_status:status});
    if(error)throw error;state.budgetWeek=data;document.querySelector('.qb-modal')?.remove();
    showToast(status==='success'?'✓ Budget day secured':status==='overspent'?'Overspending recorded · weekly penalty applied once':'Day cleared');
    await qbReloadCore();
  }catch(e){alert(e.message);render();}finally{qbBudgetSaving=false;}
}
function qbEditBudgetDay(date){
  qbModal(`<p class="eyebrow">SHARED BUDGET DAY</p><h2>${esc(date)}</h2><p>Choose the household result for this day.</p><div class="stack"><button data-budget-status="success">✓ Stayed within budget</button><button class="ghost danger" data-budget-status="overspent">× Overspent · weekly −50 Campaign XP</button><button class="ghost" data-budget-status="pending">Clear this day</button><button class="ghost" data-qb-modal-close>Cancel</button></div>`);
  document.querySelectorAll('[data-budget-status]').forEach(b=>b.onclick=()=>qbSaveBudgetDay(date,b.dataset.budgetStatus));
}
function qbBudgetOverspend(){
  const b=state.budgetWeek;
  const options=Array.from({length:7},(_,i)=>qbBudgetDate(b.week_key,i)).filter(d=>d<=b.today).map(d=>`<option value="${d}" ${d===b.today?'selected':''}>${d}</option>`).join('');
  qbModal(`<p class="eyebrow">SHARED BUDGET</p><h2>Record overspending</h2><label>Day<select id="qbBudgetFailureDate">${options}</select></label><p>This week’s −50 Campaign XP penalty applies once, even if multiple days are marked overspent.</p><div class="qb-inline-actions"><button id="qbBudgetConfirmFailure" class="danger">Record Overspending</button><button class="ghost" data-qb-modal-close>Cancel</button></div>`);
  document.querySelector('#qbBudgetConfirmFailure').onclick=()=>qbSaveBudgetDay(document.querySelector('#qbBudgetFailureDate').value,'overspent');
}
const qbWireHomeBeforeBudget=wireHomeButtons;
wireHomeButtons=function(){
  qbWireHomeBeforeBudget();
  screen.querySelectorAll('[data-budget-day]').forEach(b=>b.onclick=()=>{
    const d=b.dataset.budgetDay;
    if(state.budgetWeek.days?.[d])qbEditBudgetDay(d);else qbSaveBudgetDay(d,'success');
  });
  screen.querySelector('[data-budget-overspent]')?.addEventListener('click',qbBudgetOverspend);
  screen.querySelector('[data-budget-claim]')?.addEventListener('click',e=>{
    const q=state.quests.find(x=>x.key==='no-overspending-week');if(q&&state.budgetWeek?.claimable)completeQuest(q.id,e.currentTarget,'journal');
  });
};
// The Journal uses the same seven-day claim gate as Home and the database.
const qbQuestRowBeforeBudget=questRow;
questRow=function(q,options){
  let html=qbQuestRowBeforeBudget(q,options);
  if(q.key==='no-overspending-week'&&!state.budgetWeek?.claimable&&!state.budgetWeek?.claimed){
    html=html.replace(/(<button data-complete[^>]*)(>)/,'$1 disabled$2').replace(/>Complete<\/button>/,'>Log days on Home</button>');
  }
  return html;
};
// Pick up a spouse's updates without requiring a full page refresh.
let qbBudgetRefreshBusy=false;
async function qbRefreshBudget(){
  if(qbBudgetSaving||qbBudgetRefreshBusy||!state.membership||document.hidden||document.querySelector('.qb-modal'))return;
  qbBudgetRefreshBusy=true;
  try{
    const before=JSON.stringify(state.budgetWeek);await loadBudgetWeek();
    if(before!==JSON.stringify(state.budgetWeek)){
      await Promise.all([loadQuestCycles(),loadCompletions(),loadCampaigns(),loadPlayers()]);
      renderCampaignStrip();render();
    }
  }catch(e){console.warn('Unable to refresh shared budget',e)}finally{qbBudgetRefreshBusy=false}
}
setInterval(qbRefreshBudget,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)qbRefreshBudget()});

// Budget has its own permanent Home tracker, so omit it from Quest Watch.
const qbWatchMetaBeforeBudgetExclusion=qbWatchMeta;
qbWatchMeta=function(q){
  if(q?.key==='no-overspending-week')return null;
  return qbWatchMetaBeforeBudgetExclusion(q);
};

function qbTrainingBonusCard(a){
  const claimed=!!a.bonus_claimed_at,ready=!!a.completed_at;
  return `<div class="qb-workout-bonus"><p class="eyebrow">✦ OPTIONAL WORKOUT BONUS</p><h3>More or Harder</h3><p>Earn a bonus when you exceed the assigned workout with extra sets, reps, time, distance, or a harder version.</p><div class="quest-meta">+50 Personal XP · +10 Campaign XP · once per workout day</div><div class="qb-inline-actions"><label for="qbWorkoutBonusReason">How did you exceed it?<select id="qbWorkoutBonusReason" ${claimed||!ready?'disabled':''}><option value="more">More</option><option value="harder">Harder</option><option value="both">More and harder</option></select></label><button id="qbClaimWorkoutBonus" ${claimed||!ready?'disabled':''}>${claimed?'✓ Bonus Claimed':ready?'Claim Extra Effort Bonus':'Complete Workout First'}</button></div></div>`;
}
const qbRenderTrainingBeforeExtraEffort=renderTraining;
renderTraining=function(){
  qbRenderTrainingBeforeExtraEffort();
  const a=state.training.find(t=>t.assignment_date===localDate()&&t.user_id===ownUserId());
  if(!a)return;
  screen.querySelector('.qb-training-contract')?.insertAdjacentHTML('beforeend',qbTrainingBonusCard(a));
  screen.querySelector('#qbClaimWorkoutBonus')?.addEventListener('click',async e=>{
    const button=e.currentTarget;button.disabled=true;
    const reason=screen.querySelector('#qbWorkoutBonusReason')?.value||'more';
    const before=progressByUser(ownUserId())?.level||1;
    try{
      const {data,error}=await sb.rpc('claim_training_bonus',{p_assignment_id:a.id,p_reason:reason});
      if(error)throw error;
      showToast(`Extra effort · +${data.personal_xp} Personal XP · +${data.campaign_xp} Campaign XP`);
      await qbReloadCore();
      const after=progressByUser(ownUserId())?.level||1;if(after>before)qbLevelFanfare(after);
    }catch(error){button.disabled=false;alert(error.message)}
  });
};

async function loadSecondWind(){
  const {data,error}=await sb.rpc('second_wind_state');
  if(error){state.secondWind=null;throw error;}state.secondWind=data;
}
const qbLoadAllBeforeSecondWind=loadAll;
loadAll=async function(){await qbLoadAllBeforeSecondWind();try{await loadSecondWind()}catch(e){console.warn('Second Wind status unavailable',e)}};
function qbSecondWindReady(){return !!state.secondWind?.ready}
function qbSecondWindFitness(q){return state.secondWind?.fitness_quests?.includes(q.id)}
function qbSecondWindBase(q){
  const target=Number(safeMeta(q.recurrence).count_target||1);
  if(safeMeta(q.recurrence).type!=='daily'||target<=1)return Number(q.xp_personal||0);
  const base=Math.floor(Number(q.xp_personal||0)/target),step=Number(qbCycle(q)?.count||0)+1;
  return step===target?Number(q.xp_personal)-base*(target-1):base;
}
let qbSecondWindSaving=false;
async function qbPerformSecondWind(kind,id,source='journal'){
  if(qbSecondWindSaving)return;qbSecondWindSaving=true;
  document.querySelectorAll('[data-second-wind-quest],#qbWindConfirm,#qbWindWorkout').forEach(b=>b.disabled=true);
  try{
    const q=kind==='quest'?questById(id):null,before=progressByUser(ownUserId())?.level||1;
    const {data,error}=await sb.rpc('use_second_wind',{p_kind:kind,p_target:id,p_occurrence_key:q?occurrenceKey(q):null,p_source:source});
    if(error)throw error;
    document.querySelector('.qb-modal')?.remove();
    showToast(`Second Wind used · +${data.second_wind_bonus} extra Personal XP · weekly use spent`);
    await qbReloadCore();const after=progressByUser(ownUserId())?.level||1;if(after>before)qbLevelFanfare(after);
  }catch(e){alert(e.message);await loadSecondWind().catch(()=>{});render()}finally{qbSecondWindSaving=false}
}
function qbConfirmSecondWind(kind,id,source='journal'){
  const q=kind==='quest'?questById(id):null,a=kind==='training'?state.training.find(t=>t.id===id):null;
  const title=q?.title||a?.title||'Fitness quest',base=q?qbSecondWindBase(q):Number(a?.xp_personal||0);
  qbModal(`<p class="eyebrow">SECOND WIND · WEEKLY ACTIVE</p><h2>${esc(title)}</h2><p>Complete this ${kind==='training'?'workout':'fitness log'} with Second Wind for <b>+${fmt(base)} extra Personal XP</b>, on top of its normal reward.</p><p>This spends your weekly use. Your partner keeps their own use. Campaign XP and your partner's reward stay the same.</p><p class="fine">Undo reverses the XP, but this week's use stays spent. Resets Monday, ${esc(state.secondWind?.resets||'')}.</p><div class="qb-inline-actions"><button id="qbWindConfirm">Complete with Second Wind</button><button class="ghost" data-qb-modal-close>Cancel</button></div>`);
  document.querySelector('#qbWindConfirm').onclick=()=>qbPerformSecondWind(kind,id,source);
}
const qbWireQuestBeforeSecondWind=wireQuestButtons;
wireQuestButtons=function(){
  qbWireQuestBeforeSecondWind();
  if(!qbSecondWindReady())return;
  screen.querySelectorAll('[data-complete]').forEach(button=>{
    const q=questById(button.dataset.complete);
    if(!q||!canOwnQuest(q)||!qbSecondWindFitness(q)||!qbCycle(q)?.available||button.disabled)return;
    if(button.nextElementSibling?.dataset.secondWindQuest===q.id)return;
    button.insertAdjacentHTML('afterend',`<button class="mini ghost qb-second-wind-button" data-second-wind-quest="${q.id}" data-second-wind-source="${esc(button.dataset.source||'journal')}">✦ Second Wind</button>`);
    const wind=button.nextElementSibling;wind.onclick=()=>qbConfirmSecondWind('quest',q.id,wind.dataset.secondWindSource);
  });
};
const qbRenderTrainingBeforeSecondWind=renderTraining;
renderTraining=function(){
  qbRenderTrainingBeforeSecondWind();
  const a=state.training.find(t=>t.assignment_date===localDate()&&t.user_id===ownUserId());
  if(!a||!state.secondWind?.unlocked)return;
  const ready=qbSecondWindReady()&&!a.completed_at;
  screen.querySelector('.qb-training-contract')?.insertAdjacentHTML('beforeend',`<div class="qb-workout-bonus"><p class="eyebrow">✦ SECOND WIND</p><p>${state.secondWind.used?'Used this week':a.completed_at?'Choose an unfinished fitness quest to use Second Wind.':'Use your weekly ability to add one extra base workout XP reward.'}</p><button id="qbWindWorkout" class="ghost" ${ready?'':'disabled'}>${state.secondWind.used?'Used · resets Monday':'Complete with Second Wind'}</button><p class="fine">Your weekly use is separate from the More or Harder bonus.</p></div>`);
  screen.querySelector('#qbWindWorkout')?.addEventListener('click',()=>qbConfirmSecondWind('training',a.id));
};
const qbOpenAbilityBeforeSecondWind=qbOpenAbilityLedgerDetailV17;
qbOpenAbilityLedgerDetailV17=async function(key){
  if(key!=='cadet'||selectedCharacter().uid!==ownUserId())return qbOpenAbilityBeforeSecondWind(key);
  await loadSecondWind().catch(()=>{});
  const wind=state.secondWind;
  const qs=state.quests.filter(q=>canOwnQuest(q)&&qbSecondWindFitness(q)&&qbCycle(q)?.available);
  const a=state.training.find(t=>t.assignment_date===localDate()&&t.user_id===ownUserId()&&!t.completed_at);
  const options=(a?`<option value="training:${a.id}">Today's workout: ${esc(a.title)}</option>`:'')+qs.map(q=>`<option value="quest:${q.id}">${esc(q.title)} · +${fmt(qbSecondWindBase(q))} extra XP</option>`).join('');
  qbModal(`<p class="eyebrow">WEEKLY ACTIVE · LEVEL 5</p><h2>Second Wind</h2><p>Add one extra base Personal XP reward to a fitness completion. Existing Fate, featured, and gear modifiers keep their normal values.</p><p><b>${!wind?'Status unavailable':wind.used?'Used this week':wind.ready?'Ready to use':'Unlocks at level 5'}</b>${wind?` · Resets ${esc(wind.resets)}`:''}</p>${wind?.ready&&options?`<label>Choose a fitness quest or workout<select id="qbWindTarget">${options}</select></label><button id="qbWindChoose" class="qb-second-wind-button">Review Second Wind completion</button>`:wind?.ready?'<p>No unfinished eligible fitness quests or workout are currently available.</p>':''}<button class="ghost" data-qb-modal-close>Close</button>`);
  document.querySelector('#qbWindChoose')?.addEventListener('click',()=>{const [kind,id]=document.querySelector('#qbWindTarget').value.split(':');qbConfirmSecondWind(kind,id)});
};
