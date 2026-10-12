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
    const {data,error}=await sb.rpc('use_second_wind_abilities',{p_kind:kind,p_target:id,p_occurrence_key:q?occurrenceKey(q):null,p_source:source});
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

async function loadRested(){
  const {data,error}=await sb.rpc('rested_state');if(error){state.rested=null;throw error}state.rested=data;
}
const qbLoadAllBeforeRested=loadAll;
loadAll=async function(){await qbLoadAllBeforeRested();try{await loadRested()}catch(e){console.warn('Rested status unavailable',e)}};
function qbRestedBadge(){
  document.querySelectorAll('.qb-rested-ready').forEach(el=>el.remove());
  if(!state.rested?.ready||!state.rested?.unlocked)return;
  if(state.tab==='Character'&&selectedCharacter().uid!==ownUserId())return;
  const head=screen.querySelector('.ledger-head,.home-mast,.qb-character-summary,.training-hero');
  const pct=Number(progressByUser(ownUserId())?.level||1)>=50&&state.abilityControls?.choices?.masterwork==='rested'?50:25;
  head?.insertAdjacentHTML('beforeend',`<p class="qb-rested-ready">✦ Rested bonus ready · +${pct}% base Personal XP on your next quest</p>`);
}
const qbRenderBeforeRested=render;
render=function(){const result=qbRenderBeforeRested();qbRestedBadge();return result};
const qbCharacterBeforeRested=renderCharacter;
renderCharacter=function(){qbCharacterBeforeRested();qbRestedBadge()};
const qbOpenAbilityBeforeRested=qbOpenAbilityLedgerDetailV17;
qbOpenAbilityLedgerDetailV17=async function(key){
  if(key!=='pathfinder'||selectedCharacter().uid!==ownUserId())return qbOpenAbilityBeforeRested(key);
  await loadRested().catch(()=>{});const r=state.rested;
  qbModal(`<p class="eyebrow">RESTED · LEVEL 20</p><h2>An Hour to Recharge</h2><p>Spend an hour without screens, or enjoy another intentionally restful activity: reading, a bath, relaxing outside, or a combination.</p><p>Log the completed hour to bank <b>+25% base Personal XP on your next quest</b>. It applies automatically, once, and stays banked until used.</p><p><b>${!r?'Status unavailable':r.ready?'✦ Rested bonus ready':r.logged_this_week?'Used this week':r.unlocked?'Ready to log your restful hour':'Unlocks at level 20'}</b></p>${r?.ready?`<p class="fine">Logged activity: ${esc(r.activity||'Intentional rest')}. A pending bonus does not expire or stack.</p>`:''}${r?.can_log?`<label>Restful activity<select id="qbRestedActivity"><option>An hour without screens</option><option>Reading for enjoyment</option><option>Bath / relaxation</option><option>Relaxing outside</option><option>A combination of restful activities</option><option>Other restful activity</option></select></label><label>Optional detail<input id="qbRestedDetail" maxlength="100" placeholder="What helped you recharge?"></label><button id="qbLogRested">I completed my restful hour</button>`:''}<p class="fine">One hour can be logged per Monday–Sunday week, separately for each of you. This does not add a quest to the Daily Ledger. Undo removes awarded XP; the restful hour remains used.</p><button class="ghost" data-qb-modal-close>Close</button>`);
  document.querySelector('#qbLogRested')?.addEventListener('click',async e=>{
    const b=e.currentTarget;b.disabled=true;
    const activity=document.querySelector('#qbRestedActivity').value,detail=document.querySelector('#qbRestedDetail').value.trim();
    try{
      const {data,error}=await sb.rpc('log_rested_hour',{p_activity:detail?activity+': '+detail:activity});
      if(error)throw error;state.rested=data;document.querySelector('.qb-modal')?.remove();
      showToast('✦ Rested bonus ready · +25% base Personal XP on your next quest');
      await qbReloadCore();
    }catch(error){b.disabled=false;alert(error.message)}
  });
};


// Actionable rank abilities: personal controls, automatic bonuses, and claimable milestones.
Object.assign(QB_ABILITY_LEDGER_V17,{
 crawler:{kind:'Milestone reward',effect:'Claim a Gauntlet Token at Level 10 and every five levels afterward.',bonus:'Keep the token in your Pack, then Use it to offer your partner an eligible Gauntlet. Ordinary gear loot continues separately.',stat:'Challenge loot · every 5 levels'},
 rider:{kind:'Build unlock',effect:'Learn or deepen a specialization from Chosen Paths at Level 15.',bonus:'Each path has two ability ranks. Earlier choices are preserved and their effects begin at Level 15.',stat:'2 ability ranks per path'},
 witcher:{kind:'Weekly active',effect:'Choose an available quest as your Contract, then complete it normally.',bonus:'Adds +100% base Personal XP to your next completion of that quest. One use per Monday–Sunday week, separately for each player. Undo removes the XP but does not refund the weekly use.',stat:'+100% base XP · 1/week'},
 champion:{kind:'Automatic co-op bonus',effect:'Completing a co-op quest gives each eligible player their own Rally bonus.',bonus:'Adds +10% base Personal XP automatically. No activation required.',stat:'+10% co-op XP'},
 wingleader:{kind:'Category choice',effect:'Choose an existing quest category to favor.',bonus:'Adds +20% base Personal XP whenever you receive a quest reward in that category. Applies automatically until you change your choice.',stat:'+20% favored-category XP'},
 grandmaster:{kind:'Ability upgrade',effect:'Choose one earlier ability to improve. You can change the choice for future completions.',bonus:'Second Wind: +25% base XP; Rested: +50% instead of +25%; Contract: +125% instead of +100%; Rally: +20% instead of +10%; Favor: +30% instead of +20%. Bonuses use base XP and stack without multiplying one another.',stat:'Upgrade 1 ability'},
 commander:{kind:'Focus capacity',effect:'Your personal Focus Board expands from five pinned quests to six.',bonus:'Manage your pins from the Quest Journal or Home. Pinning organizes quests; completion still respects each quest’s owner, season, and reset period.',stat:'6 focus slots'},
 ascendant:{kind:'Automatic personal Fate',effect:'Each day, your character has a 10% chance to draw Legendary Fortune.',bonus:'A rare draw adds +25% base Personal XP to your next eligible quest reward that day. It is personal, stays the same on refresh, and stacks with shared Fate. Undo does not restore the draw.',stat:'10% rare draw · +25% next quest'},
 legend:{kind:'Milestone claim',effect:'Claim Prestige at Level 100 and every 25 levels afterward.',bonus:'Each claim adds 500 Personal XP and an epic or legendary gear item. Your existing XP, gear, and quest history are preserved.',stat:'+500 XP + high-rarity gear'}
});
const QB_PATH_EFFECTS={
 Archivist:['Deep Study · +10% base XP on Knowledge/Growth quests and Finish a book.','Research Expedition · +25% base expedition XP.'],
 Vanguard:['Second Wind mastery · +25% base XP when you use Second Wind.','Battle Rhythm · +10% base workout/fitness XP.'],
 Pathfinder:['Cartographer · reveal one extra unexplored cell per expedition, while cells remain.','Farther Roads · +20% base expedition Renown, minimum +1.'],
 Steward:['Good Order · +10% base XP on Home/Tasks/Homestead/Finance/Garage quests.','Guild Provisioner · +10% base Campaign XP on those quests you complete, capped at the active Campaign goal.']
};
async function loadAbilityControls(){
 const jobs=[['abilityControls','ability_preferences_state'],['abilityMilestones','ability_milestones_state'],['legendaryDraw','legendary_draw_state']];
 await Promise.all(jobs.map(async([key,rpc])=>{const {data,error}=await sb.rpc(rpc);state[key]=error?null:data;if(error)console.warn('Ability status unavailable',rpc,error.message)}));
}
const qbLoadAllBeforeAbilityControls=loadAll;
loadAll=async function(){await qbLoadAllBeforeAbilityControls();await loadAbilityControls()};
function qbAbilityChoices(){return state.abilityControls?.choices||{}}
async function qbSaveAbilityChoice(key,value,button){
 if(button)button.disabled=true;
 try{const {data,error}=await sb.rpc('set_ability_preference',{p_key:key,p_value:value});if(error)throw error;state.abilityControls=data;document.querySelector('.qb-modal')?.remove();showToast(key==='pin'?'Focus Board updated.':'Ability choice saved.');await qbReloadCore()}
 catch(error){if(button)button.disabled=false;alert(error.message)}
}
async function qbClaimAbilityReward(ability,button){
 button.disabled=true;
 try{const {data,error}=await sb.rpc('claim_ability_milestone',{p_ability:ability});if(error)throw error;document.querySelector('.qb-modal')?.remove();showToast(`${data.item_name} is waiting in Unclaimed Loot${data.personal_xp?` · +${data.personal_xp} Personal XP`:''}`);await qbReloadCore()}
 catch(error){button.disabled=false;alert(error.message)}
}
function qbFocusCard(){
 if(!state.abilityControls)return'';
 const pins=qbAbilityChoices().pin||[],qs=pins.map(id=>questById(id)).filter(Boolean);
 return `<section class="card qb-focus-card"><div class="card-head"><div><p class="eyebrow">✦ YOUR FOCUS BOARD</p><h2>${pins.length} / ${state.abilityControls.focus_capacity} pinned quests</h2></div><button class="mini ghost" data-qb-focus-manage>Manage Focus</button></div>${qs.length?`<div class="quest-list">${qs.map(q=>questRow(q,{compact:true})).join('')}</div>`:'<p class="fine">Pin quests you want to keep close at hand.</p>'}</section>`;
}
function qbWireFocus(){screen.querySelectorAll('[data-qb-focus-manage]').forEach(b=>b.onclick=qbOpenFocusBoard)}
async function qbOpenFocusBoard(){
 await loadAbilityControls();const s=state.abilityControls;if(!s)return alert('Focus status unavailable. Please refresh.');
 const pins=qbAbilityChoices().pin||[],available=state.quests.filter(q=>canOwnQuest(q)&&!q.hidden_encounter&&qbCycle(q)?.available&&!pins.includes(q.id));
 qbModal(`<p class="eyebrow">PERSONAL FOCUS</p><h2>Your Focus Board</h2><p>${pins.length} / ${s.focus_capacity} slots. A sixth slot unlocks at Level 60. Pinning never changes a quest’s reset or adds it to the Daily Ledger.</p><div class="qb-focus-pins">${pins.map(id=>`<div><span>${esc(questById(id)?.title||'Unavailable quest')}</span><button class="mini ghost" data-qb-unpin="${esc(id)}">Unpin</button></div>`).join('')||'<p>No quests pinned yet.</p>'}</div>${available.length&&pins.length<s.focus_capacity?`<label>Choose an available quest<select id="qbFocusQuest">${available.map(q=>`<option value="${q.id}">${esc(q.title)}</option>`).join('')}</select></label><button id="qbPinQuest">Pin Quest</button>`:''}<button class="ghost" data-qb-modal-close>Close</button>`);
 document.querySelectorAll('[data-qb-unpin]').forEach(b=>b.onclick=()=>qbSaveAbilityChoice('pin',b.dataset.qbUnpin,b));
 document.querySelector('#qbPinQuest')?.addEventListener('click',e=>qbSaveAbilityChoice('pin',document.querySelector('#qbFocusQuest').value,e.currentTarget));
}
const qbJournalBeforeAbilityControls=renderJournal;
renderJournal=function(){qbJournalBeforeAbilityControls();screen.querySelector('.ledger-head')?.insertAdjacentHTML('afterend',qbFocusCard());wireQuestButtons();qbWireFocus()};
const qbHomeBeforeAbilityControls=renderHome;
renderHome=function(){qbHomeBeforeAbilityControls();const focusAnchor=screen.querySelector('.campaign-home')||screen.querySelector('.home-mast');focusAnchor?.insertAdjacentHTML('afterend',qbFocusCard());wireQuestButtons();qbWireFocus();const f=state.legendaryDraw;if(f?.unlocked)screen.querySelector('.home-mast')?.insertAdjacentHTML('beforeend',`<p class="qb-personal-fate">✦ Legendary Draw · ${f.ready?'Rare Fortune ready: +25% base XP on your next quest today':f.used?'Rare Fortune used today':'Quiet personal draw today'}.</p>`)};
const qbCharacterBeforeAbilityControls=renderCharacter;
renderCharacter=function(){
 qbCharacterBeforeAbilityControls();const {uid,progress}=selectedCharacter();if(uid!==ownUserId())return;
 const level=Number(progress?.level||1),card=screen.querySelector('.qb-ability-ledger-v17'),m=state.abilityMilestones;
 card?.insertAdjacentHTML('beforeend',`<div class="qb-ability-actions"><button class="ghost" data-qb-focus-manage>Manage Focus Board</button>${m?.loot_find_level?'<button data-qb-milestone="loot_find">Claim Loot Find Reward</button>':''}${m?.prestige_level?'<button data-qb-milestone="prestige">Claim Prestige Reward</button>':''}</div>`);qbWireFocus();
 screen.querySelectorAll('[data-qb-milestone]').forEach(b=>b.onclick=()=>qbClaimAbilityReward(b.dataset.qbMilestone,b));
 const paths=[...screen.querySelectorAll('.card')].find(c=>c.querySelector('[data-qb-spec]'));
 if(paths){paths.querySelectorAll('.qb-path-effects').forEach(n=>n.remove());paths.insertAdjacentHTML('beforeend',`<div class="qb-path-effects"><p class="fine">${level<15?'Your saved paths become active at Level 15.':'Two ranks per path; bonuses apply automatically.'}</p>${(state.specializations||[]).filter(s=>s.rank>0).map(s=>`<p><b>${esc(s.specialization_key)}</b><br>${(QB_PATH_EFFECTS[s.specialization_key]||[]).slice(0,s.rank).map(esc).join('<br>')}</p>`).join('')}</div>`);}
 screen.querySelectorAll('[data-qb-spec]').forEach(b=>{const rank=Number(state.specializations?.find(s=>s.specialization_key===b.dataset.qbSpec)?.rank||0);if(level<15||rank>=2){b.disabled=true;b.textContent=level<15?'Unlocks at 15':'Both abilities learned';}});
};
const qbOpenAbilityBeforeControls=qbOpenAbilityLedgerDetailV17;
qbOpenAbilityLedgerDetailV17=async function(key){
 if(selectedCharacter().uid!==ownUserId()||!['crawler','rider','witcher','wingleader','grandmaster','commander','ascendant','legend'].includes(key))return qbOpenAbilityBeforeControls(key);
 if(key==='commander')return qbOpenFocusBoard();
 await loadAbilityControls();const rank=RANKS.find(r=>r.key===key),d=QB_ABILITY_LEDGER_V17[key],s=state.abilityControls,m=state.abilityMilestones,c=qbAbilityChoices();if(!rank||!d)return;
 let control='',choiceKey='';const level=Number(progressByUser(ownUserId())?.level||1);
 if(level>=rank.min&&s){
  if(key==='witcher'){
   choiceKey='contract';const qs=state.quests.filter(q=>canOwnQuest(q)&&!q.hidden_encounter&&qbCycle(q)?.available);
   control=s.contract_used?`<p><b>Used this week.</b> Resets ${esc(s.resets)}.</p>`:`<p>Current Contract: <b>${esc(questById(c.contract)?.title||'None')}</b></p><label>Choose your Contract<select id="qbAbilityChoice"><option value="">No Contract</option>${qs.map(q=>`<option value="${q.id}" ${c.contract===q.id?'selected':''}>${esc(q.title)}</option>`).join('')}</select></label><button id="qbSaveAbilityChoice">Save Contract</button>`;
  }else if(key==='wingleader'){
   choiceKey='favor';const cats=[...new Set(state.quests.filter(q=>!q.hidden_encounter).map(q=>q.category))].sort();control=`<label>Favored category<select id="qbAbilityChoice"><option value="">None</option>${cats.map(cat=>`<option ${c.favor===cat?'selected':''}>${esc(cat)}</option>`).join('')}</select></label><button id="qbSaveAbilityChoice">Save Category</button>`;
  }else if(key==='grandmaster'){
   choiceKey='masterwork';control=`<label>Ability to upgrade<select id="qbAbilityChoice"><option value="">None</option>${[['second_wind','Second Wind'],['rested','Rested'],['contract','Witcher’s Contract'],['rally','Rally'],['favor','Commander’s Favor']].map(([v,n])=>`<option value="${v}" ${c.masterwork===v?'selected':''}>${n}</option>`).join('')}</select></label><button id="qbSaveAbilityChoice">Save Upgrade</button>`;
  }else if(key==='crawler'||key==='legend'){
   const ability=key==='crawler'?'loot_find':'prestige',milestone=key==='crawler'?m?.loot_find_level:m?.prestige_level;control=milestone?`<p>Level ${milestone} reward ready.</p><button data-qb-milestone="${ability}">Claim Reward</button>`:'<p>No unclaimed milestone rewards yet.</p>';
  }else if(key==='ascendant'){
   const f=state.legendaryDraw;control=`<p><b>${f?.ready?'Rare Fortune ready':f?.used?'Used today':'Quiet draw today'}</b> · ${esc(f?.date||'')}</p>`;
  }else if(key==='rider')control='<p>Use the Learn or Deepen buttons in your Chosen Paths panel.</p>';
 }
 qbModal(`<p class="eyebrow">${esc(d.kind.toUpperCase())} · LEVEL ${rank.min}</p><h2>${esc(rank.ability)}</h2><p>${esc(d.effect)}</p><p>${esc(d.bonus)}</p>${control}<button class="ghost" data-qb-modal-close>Close</button>`);
 document.querySelector('#qbSaveAbilityChoice')?.addEventListener('click',e=>qbSaveAbilityChoice(choiceKey,document.querySelector('#qbAbilityChoice').value,e.currentTarget));
 document.querySelector('.qb-modal [data-qb-milestone]')?.addEventListener('click',e=>qbClaimAbilityReward(e.currentTarget.dataset.qbMilestone,e.currentTarget));
};

// Refresh personal daily Fate after a sleeping browser crosses guild midnight.
const qbRefreshDayBeforeAbilityControls=qbRefreshDay;
qbRefreshDay=async function(){const oldDate=state.legendaryDraw?.date;await qbRefreshDayBeforeAbilityControls();if(state.membership&&oldDate&&oldDate!==localDate()){await loadAbilityControls();render()}};

// A weekly Cheat Day secures Drew's Locked In streak without completing nutrition quests or awarding XP.
async function loadLockedCheat(){const {data,error}=await sb.rpc('locked_in_cheat_state');state.lockedCheat=error?null:data;if(error)console.warn('Locked In Cheat Day unavailable',error.message)}
const qbLoadAllBeforeLockedCheat=loadAll;
loadAll=async function(){await qbLoadAllBeforeLockedCheat();await loadLockedCheat()};
const qbLockedDataBeforeCheat=drewLockedData;
drewLockedData=function(){const data=qbLockedDataBeforeCheat(),days=new Set(data.days||[]);for(const d of state.lockedCheat?.days||[])days.add(d);return {...data,days,streak:streakFromSet(days),secured:days.has(localDate()),cheat:state.lockedCheat?.days?.includes(localDate())||false}};
function qbLockedCheatButton(){const s=state.lockedCheat;if(!s)return'';const drew=memberByKey('Drew');if(!drew||(ownUserId()!==drew.user_id&&state.membership.role!=='admin'))return'';return `<div class="qb-inline-actions"><button class="ghost" data-locked-cheat ${s.can_use?'':'disabled'}>${s.used_this_week?'✓ Cheat Day Used':s.secured_by_goals?'Today Already Secured':'Use Cheat Day · 1/week'}</button></div><p class="fine">Protects today's Locked In streak without marking Protein or Calories complete or awarding XP. Resets Monday, ${esc(s.resets)}.</p>`}
function qbWireLockedCheat(){screen.querySelectorAll('[data-locked-cheat]').forEach(b=>b.onclick=()=>{qbModal(`<p class="eyebrow">DREW · LOCKED IN</p><h2>Use today as a Cheat Day?</h2><p>Today will count toward Drew's Locked In streak. This spends his one Cheat Day for the Monday–Sunday week. It awards no XP and does not complete either nutrition quest.</p><button id="qbConfirmLockedCheat">Use Cheat Day Today</button><button class="ghost" data-qb-modal-close>Cancel</button>`);document.querySelector('#qbConfirmLockedCheat').onclick=async e=>{const button=e.currentTarget;button.disabled=true;try{const {data,error}=await sb.rpc('use_locked_in_cheat_day');if(error)throw error;state.lockedCheat=data;document.querySelector('.qb-modal')?.remove();showToast('Drew’s Locked In streak secured with a Cheat Day.');await qbReloadCore()}catch(error){button.disabled=false;alert(error.message)}}})}
const qbLockedPanelBeforeCheat=qbLockedInPanel;
qbLockedInPanel=function(){return qbLockedPanelBeforeCheat().replace('</section>',qbLockedCheatButton()+'</section>')};
const qbCharacterBeforeLockedCheat=renderCharacter;
renderCharacter=function(){qbCharacterBeforeLockedCheat();qbWireLockedCheat();if(drewLockedData().cheat)screen.querySelector('.qb-locked-panel .count-pill')?.replaceChildren(document.createTextNode('Cheat Day Secured'))};
const qbStreakCardBeforeCheat=streakCard;
streakCard=function(){return qbStreakCardBeforeCheat().replace('</section>',qbLockedCheatButton()+'</section>')};
const qbHomeBeforeLockedCheat=renderHome;
renderHome=function(){qbHomeBeforeLockedCheat();qbWireLockedCheat()};

const qbRefreshDayBeforeLockedCheat=qbRefreshDay;
qbRefreshDay=async function(){const oldDay=state.lockedCheat?.today;await qbRefreshDayBeforeLockedCheat();if(state.membership&&oldDay&&oldDay!==localDate()){await loadLockedCheat();render()}};
document.addEventListener('visibilitychange',async()=>{if(!document.hidden&&state.membership){await loadLockedCheat();render()}});

