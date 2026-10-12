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
