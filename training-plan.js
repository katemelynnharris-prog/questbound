/* Session-based Basgiath / Witcher training. Backend owns visits and rewards. */
async function qbLoadTrainingPlan(){
 const {data,error}=await sb.rpc('training_plan_state');
 if(error){state.trainingPlan=null;throw error}state.trainingPlan=data;
}
const qbLoadAllBeforeTrainingPlan=loadAll;
loadAll=async function(){await qbLoadAllBeforeTrainingPlan();try{await qbLoadTrainingPlan()}catch(e){console.warn('Training plan unavailable',e)}};
function qbTrainingLocationLabel(meta){return ({gym:'Gym',home:'Home',outdoors:'Outdoors'})[meta?.location]||(meta?.gym_visit?'Gym':'Home / outdoors')}
function qbGymSummaryCard(compact=false){
 const p=state.trainingPlan;if(!p)return '';
 const rows=(p.members||[]).map(m=>{const workouts=Number(m.workouts??m.visits??0);return `<div class="qb-gym-person"><div><b>${esc(m.player)}</b><span>${fmt(m.streak)}-week gym streak · ${m.secured?'secured':'this week open'}</span></div><strong>${fmt(workouts)} / 2</strong><small>workouts this week · ${fmt(m.visits)} gym · ${fmt(Math.max(0,workouts-m.visits))} home/outdoors</small></div>`}).join('');
 return `<${compact?'div':'section'} class="${compact?'qb-gym-home':'card qb-gym-week'}"><p class="eyebrow">🔥 GYM STREAK & WORKOUTS</p><div class="qb-gym-people">${rows}</div><p class="fine">1 gym visit keeps your gym streak · 2 workouts anywhere reaches your workout goal · resets Monday</p>${compact?'':`<div class="qb-gym-rewards">${[[1,25,5],[2,75,15],[3,25,5]].map(([v,x,c])=>`<span><b>Workout ${v}</b> +${x} XP · +${c} Campaign</span>`).join('')}</div><p class="fine">Gym, home, and outdoor strength, climbing, or cardio workouts count. One completed workout counts per day. Bonuses apply once per tier each week, with no extra attendance bonus after workout three. Recovery and stretching earn their normal XP. A gym workout also secures your gym streak, without awarding a second set of weekly bonuses.</p>`}</${compact?'div':'section'}>`;
}
const qbStreakCardBeforeGymPlan=streakCard;
streakCard=function(){const html=qbStreakCardBeforeGymPlan();return html.replace('</section>',qbGymSummaryCard(true)+'</section>')};
function qbTrainingToday(){return state.training.find(t=>t.user_id===ownUserId()&&t.assignment_date===localDate())}
function qbTrainingLastLog(id,exclude){
 for(const h of state.trainingPlan?.history||[]){if(h.id===exclude||!h.completed_at)continue;const l=h.gym_upgrade?.logs?.find(x=>x.id===id);if(l?.sets?.some(s=>s.reps!==null&&s.reps!==''))return `${h.assignment_date}: `+l.sets.filter(s=>s.reps!==null&&s.reps!=='').map(s=>`${s.weight??'BW'}${s.weight!=null?' lb':''} × ${s.reps}`).join(' · ')}return '';
}
function qbTrainingExercises(spec,a){
 const sets=Math.max(1,Math.min(3,Number(spec.sets||2)));
 return `<div class="qb-exercise-list">${(spec.exercises||[]).map((e,i)=>{
 const log=spec.logs?.find(x=>x.id===e.id),last=qbTrainingLastLog(e.id,a?.id);
 return `<div class="qb-exercise" data-exercise="${esc(e.id)}"><div class="qb-exercise-heading"><span>${i+1}</span><div><h3>${esc(e.name)}</h3><small>${sets} set${sets===1?'':'s'} · ${esc(e.reps)} · ${esc(e.skill)}</small></div></div><p>${esc(e.cue)}</p>${last?`<p class="qb-last-load">Last: ${esc(last)}</p>`:''}<div class="qb-set-grid">${Array.from({length:sets},(_,j)=>{const s=log?.sets?.[j]||{};return `<fieldset><legend>Set ${j+1}</legend><label>Load (lb)<input data-load type="number" min="0" max="2000" step="0.5" inputmode="decimal" placeholder="BW" value="${s.weight??''}" ${!a?'disabled':''}></label><label>${/second/.test(e.reps)?'Seconds':'Reps / side'}<input data-reps type="number" min="0" max="1000" step="1" inputmode="numeric" value="${s.reps??''}" ${!a?'disabled':''}></label></fieldset>`}).join('')}</div></div>`;
 }).join('')}</div>`;
}
function qbTrainingWeekSummary(){
 const p=state.trainingPlan,m=p.members?.find(x=>x.user_id===ownUserId())||{},n=Number(m.workouts??m.visits??0);
 return `<section class="qb-training-week-simple"><div><p class="eyebrow">THIS WEEK</p><h2>${fmt(n)} of 2 workouts</h2><div class="progress slim"><span style="width:${Math.min(100,n*50)}%"></span></div></div><p><b>Gym streak: ${fmt(m.streak||0)} week${m.streak===1?'':'s'}</b><small>${m.secured?'✓ Secured this week':'One gym visit keeps it going'}</small></p></section>`;
}
function qbTrainingSessionCard(a){
 const p=state.trainingPlan,chosen=a?.gym_upgrade?.plan_version===1,s=chosen?a.gym_upgrade:p.next,done=!!a?.completed_at,plan=!chosen||s.kind==='plan';
 return `<section class="card qb-training-contract qb-plan-contract"><p class="eyebrow">${done?'TODAY’S WORKOUT COMPLETE':chosen?'YOUR WORKOUT':'YOUR NEXT WORKOUT'}</p><h2>${done?'✓ ':''}${esc(chosen?a.title:s.title)}</h2><p class="qb-workout-duration">${plan?`Full-body ${esc(s.session||'')} · ${esc(s.duration||'30–45 min')}`:esc(a.assignment_type)}${s.short?' · Short version':''}</p>
 ${!chosen?'<button class="qb-workout-primary" data-prepare-plan="full">Start Workout</button>':''}
 ${chosen&&plan?`<p>Warm up first. Rest between sets and keep a couple of good repetitions in reserve.</p><ol class="qb-workout-steps">${(s.exercises||[]).map(e=>`<li><div><b>${esc(e.name)}</b><span>${fmt(s.sets||2)} set${s.sets===1?'':'s'} · ${esc(e.reps)}</span></div><small>${esc(e.cue)}</small></li>`).join('')}</ol><details class="qb-workout-log"><summary>Weights, reps & notes</summary>${qbTrainingExercises(s,a)}<label>Session notes<textarea id="qbTrainingNotes" maxlength="1000" placeholder="Exercise variation, how it felt, or a note for next time">${esc(s.notes||'')}</textarea></label><button id="qbSaveTrainingLog" class="ghost">Save Log</button><p class="fine">Logging weights is optional. Leave load blank for bodyweight.</p></details><details><summary>Workout tips</summary><p>${esc(s.guidance||'')}</p></details>`:chosen?`<p>${esc(a.objective)}</p>`:''}
 ${!chosen?`<details class="qb-workout-preview"><summary>Preview exercises</summary><ul>${(s.exercises||[]).map(e=>`<li>${esc(e.name)} · ${esc(e.reps)}</li>`).join('')}</ul></details>`:''}
 ${chosen?`<button class="qb-workout-primary" id="qbPlanComplete" ${done?'disabled':''}>${done?'Workout Logged':'Finish Workout'}</button>${done?`<p>+${fmt(a.xp_personal)} base XP · ${esc(qbTrainingLocationLabel(s))}</p><p class="fine">Your next workout will be ready on another day.</p><details><summary>Optional extra-effort bonus</summary>${qbTrainingBonusCard(a)}</details>`:'<p class="fine">Choose where you exercised when you finish. Rewards are automatic.</p>'}`:''}
 ${!done?`<details class="qb-workout-short"><summary>Short on time?</summary><p>The shorter version takes about 10–20 minutes and still counts.</p><button class="ghost" data-prepare-plan="short">Use Short Workout</button></details><details class="qb-workout-alternatives"><summary>Doing something else?</summary><div class="qb-inline-actions"><button class="ghost" data-extra-session="bodyweight">Bodyweight Workout</button><button class="ghost" data-extra-session="climb">Climbing</button><button class="ghost" data-extra-session="conditioning">Cardio / Walk</button><button class="ghost" data-extra-session="recovery">Recovery</button>${chosen?'<button class="ghost" data-prepare-plan="full">Return to Full Workout</button>':''}</div></details>`:''}</section>`;
}
function qbTrainingRecords(){
 const p=state.trainingPlan,rider=state.membership.player_key!=='Drew';
 return `<details class="card qb-training-records"><summary>Training progress & history</summary><h3>${fmt(p.completed_sessions)} strength sessions</h3><p>${esc(p.next.phase)} · Next: session ${fmt(p.next.sequence)}${p.next.sequence<=24?' of 24':''}</p><p>${rider?'Induction → Gauntlet → Sparring → Threshing':'Foundations → The Path → Contracts → Medallion'}</p><p class="fine">Your plan advances with completed strength sessions. Climbing, cardio, and recovery leave the next strength session waiting.</p>${qbTrainingStatBars()}<h3>Recent workouts</h3>${(p.history||[]).filter(h=>h.completed_at).map(h=>`<details class="qb-plan-history-row"><summary>${esc(h.title)} · ${esc(h.assignment_date)} · ${esc(qbTrainingLocationLabel(h.gym_upgrade))}</summary>${(h.gym_upgrade.logs||[]).map(l=>`<p>${esc(h.gym_upgrade.exercises?.find(e=>e.id===l.id)?.name||l.id)}: ${l.sets.filter(s=>s.reps!=null).map(s=>`${esc(s.weight??'BW')}${s.weight!=null?' lb':''} × ${esc(s.reps)}`).join(' · ')||'No weights recorded'}</p>`).join('')}${h.gym_upgrade.notes?`<p>${esc(h.gym_upgrade.notes)}</p>`:''}</details>`).join('')||'<p>No completed sessions yet.</p>'}</details><details class="card qb-training-reward-details"><summary>How streaks & rewards work</summary><p>Two workouts anywhere is your weekly goal. One gym visit keeps your separate gym streak going. Both reset Monday.</p><p>Weekly bonuses, on top of normal XP: workout 1 +25 XP / +5 Campaign; workout 2 +75 / +15; workout 3 +25 / +5.</p><p>One workout counts per day. Recovery earns normal XP but does not count toward the weekly goal or gym streak. Extra workouts keep their normal rewards.</p></details>`;
}
function qbReadTrainingLogs(){
 return [...screen.querySelectorAll('[data-exercise]')].map(e=>({id:e.dataset.exercise,sets:[...e.querySelectorAll('fieldset')].map(s=>({weight:s.querySelector('[data-load]').value===''?null:Number(s.querySelector('[data-load]').value),reps:s.querySelector('[data-reps]').value===''?null:Number(s.querySelector('[data-reps]').value)}))}));
}
async function qbSavePlanLog(a,notify=true){
 if(safeMeta(a.gym_upgrade).kind!=='plan')return;
 const {error}=await sb.rpc('save_training_log',{p_assignment_id:a.id,p_logs:qbReadTrainingLogs(),p_notes:screen.querySelector('#qbTrainingNotes')?.value||''});if(error)throw error;
 if(notify)showToast('Weight log saved.');
}
let qbTrainingPlanBusy=false;
async function qbPreparePlan(kind,short=false,location='gym'){
 if(qbTrainingPlanBusy)return;qbTrainingPlanBusy=true;
 try{const {error}=await sb.rpc('prepare_training_session_v2',{p_kind:kind,p_short:short,p_location:location});if(error)throw error;await qbReloadCore()}catch(e){alert(e.message)}finally{qbTrainingPlanBusy=false}
}
function qbFinishWorkout(a){
 qbModal(`<p class="eyebrow">FINISH WORKOUT</p><h2>Where did you exercise?</h2><label>Location<select id="qbWorkoutLocation"><option value="">Choose a location</option><option value="gym">Gym</option><option value="home">Home</option><option value="outdoors">Outdoors</option></select></label><p>${a.gym_upgrade.kind==='recovery'?'Recovery earns its normal XP.':'Your weekly workout bonus is added automatically. A gym workout also counts for your gym streak.'}</p><div class="qb-inline-actions"><button id="qbConfirmWorkoutLocation" disabled>Log Workout</button><button class="ghost" data-qb-modal-close>Cancel</button></div>`);
 const select=document.querySelector('#qbWorkoutLocation'),button=document.querySelector('#qbConfirmWorkoutLocation');
 select.onchange=()=>{button.disabled=!select.value};
 button.onclick=async()=>{
  if(!select.value||qbTrainingPlanBusy)return;qbTrainingPlanBusy=true;button.disabled=true;
  try{
   await qbSavePlanLog(a,false);
   const meta=a.gym_upgrade,kind=meta.variant==='bodyweight'?'bodyweight':meta.kind;
   const {error}=await sb.rpc('prepare_training_session_v2',{p_kind:kind,p_short:!!meta.short,p_location:select.value});if(error)throw error;
   a.gym_upgrade={...meta,location:select.value,gym_visit:select.value==='gym'&&kind!=='recovery'};
   document.querySelector('.qb-modal')?.remove();await qbCompleteTraining(a);
  }catch(e){alert(e.message);button.disabled=false}finally{qbTrainingPlanBusy=false}
 };
}
const qbRenderTrainingBeforePlan=renderTraining;
renderTraining=function(){
 const p=state.trainingPlan;if(!p)return qbRenderTrainingBeforePlan();
 qbRenderTrainingBeforePlan();const heroNode=screen.querySelector('.training-hero');const subtitle=heroNode?.querySelectorAll('p').item(heroNode.querySelectorAll('p').length-1);if(subtitle)subtitle.textContent=state.membership.player_key==='Drew'?'Trials of the Path · one workout at a time.':'Basgiath Rider Induction · one workout at a time.';const hero=heroNode?.outerHTML||'';
 const a=qbTrainingToday(),chosen=a?.gym_upgrade?.plan_version===1;
 screen.innerHTML=hero+`<div class="qb-training-simple">${qbTrainingWeekSummary()}${qbTrainingSessionCard(chosen?a:null)}${qbTrainingRecords()}</div>`;
 if(a?.completed_at&&!chosen){screen.querySelector('.qb-plan-contract').innerHTML=`<p class="eyebrow">TODAY’S WORKOUT COMPLETE</p><h2>✓ ${esc(a.title)}</h2><p>Your next workout will be ready on another day.</p>`}
 qbApplyRidersQuadrantVisualV20();if(typeof qbApplyWitcherLogo==='function')qbApplyWitcherLogo();
 screen.querySelectorAll('[data-prepare-plan]').forEach(b=>b.onclick=async()=>{if(chosen)try{await qbSavePlanLog(a,false)}catch(e){return alert(e.message)}await qbPreparePlan(b.dataset.preparePlan==='short'&&a?.gym_upgrade?.variant==='bodyweight'?'bodyweight':'plan',b.dataset.preparePlan==='short','home')});
 screen.querySelectorAll('[data-extra-session]').forEach(b=>b.onclick=async()=>{if(chosen)try{await qbSavePlanLog(a,false)}catch(e){return alert(e.message)}await qbPreparePlan(b.dataset.extraSession,false,'home')});
 screen.querySelector('#qbSaveTrainingLog')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{await qbSavePlanLog(a);await qbLoadTrainingPlan()}catch(e){alert(e.message)}finally{b.disabled=false}});
 screen.querySelector('#qbPlanComplete')?.addEventListener('click',()=>qbFinishWorkout(a));
 screen.querySelector('#qbClaimWorkoutBonus')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{const {data,error}=await sb.rpc('claim_training_bonus',{p_assignment_id:a.id,p_reason:screen.querySelector('#qbWorkoutBonusReason').value});if(error)throw error;showToast(`Extra effort · +${data.personal_xp} XP · +${data.campaign_xp} Campaign`);await qbReloadCore()}catch(e){alert(e.message);b.disabled=false}});
};
