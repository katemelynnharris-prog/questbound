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
function qbTrainingSessionCard(a){
 const spec=safeMeta(a?.gym_upgrade),p=state.trainingPlan,chosen=spec.plan_version===1,s=chosen?spec:p.next,done=!!a?.completed_at;
 const rider=state.membership.player_key!=='Drew';
 const phases=rider?['Induction','Gauntlet','Sparring','Threshing']:['Foundations','The Path','Contracts','Medallion'];
 const sequence=Number(s.sequence||p.next.sequence),index=Math.min(3,Math.floor((sequence-1)/6));
 return `<section class="card qb-training-contract qb-plan-contract"><p class="eyebrow">${chosen?'YOUR SESSION':'NEXT FULL-BODY SESSION'}${chosen&&s.kind!=='plan'?' · OPTIONAL':''}</p><h2>${esc(chosen?a.title:s.title)}</h2>${!chosen||s.kind==='plan'?`<div class="qb-training-phases">${phases.map((phase,i)=>`<span ${i===index?'aria-current="step"':''}>${esc(phase)}</span>`).join('')}</div><p>${esc(s.phase)} · Session ${esc(s.session)} · ${sequence<=24?`${sequence} / 24`:`continuing practice ${sequence-24}`} · ${esc(s.duration)}</p><p>${esc(s.progression)}</p><p class="fine">Progress follows completed strength sessions. The next session waits for you; climbing and recovery are optional extras.</p>`:''}
 ${chosen?`<p>${esc(a.objective)}</p><div class="quest-meta">+${fmt(a.xp_personal)} Personal XP · +${fmt(a.xp_campaign)} Campaign XP · ${esc(qbTrainingLocationLabel(s))} · ${s.kind==='recovery'?'Recovery XP only':'Counts toward weekly workout bonuses'}${s.gym_visit?' · also counts for your gym streak':''}</div>`:'<p>Two full-body workouts are the goal. Start with the full session, or use the shorter version when time is tight.</p>'}
 ${!chosen?`<label class="qb-training-location">Session location<select id="qbPlanLocation"><option value="gym">Gym</option><option value="home">Home</option><option value="outdoors">Outdoors</option></select></label><div class="qb-inline-actions"><button data-prepare-plan="full">Start Full Session</button><button data-prepare-plan="short" class="ghost">Busy-day Session · 10–20 min</button></div><p class="fine">Starting opens your workout log. Rewards are awarded when you complete it.</p>`:''}
 ${!chosen||s.kind==='plan'?`<details class="qb-training-exercises" ${chosen?'open':''}><summary>${chosen?'Exercises & weight log':'Preview exercises'}</summary><p>${esc(s.guidance)}</p>${qbTrainingExercises(s,chosen?a:null)}${chosen?`<label>Session notes<textarea id="qbTrainingNotes" maxlength="1000" placeholder="Exercise substitutions, how it felt, or a note for next time">${esc(s.notes||'')}</textarea></label><button id="qbSaveTrainingLog" class="ghost">Save Weight Log</button><p class="fine">Use the same units each time. Leave load blank for bodyweight. Record per-side repetitions or seconds as shown.</p>`:''}</details>`:''}
 ${chosen?`<div class="qb-inline-actions"><button id="qbPlanComplete" ${done?'disabled':''}>${done?'✓ Session Complete':'Complete Session'}</button>${!done?'<button id="qbChangeTraining" class="ghost">Change Session</button>':''}</div>${done?'<p class="fine">Today is logged. Your next session will be available on another day.</p>':''}${s.optional?`<details><summary>Optional ${rider?'Rider':'Witcher'} Skills</summary><p>${esc(s.optional)}</p><p>Climbing is optional; it is not required before lifting. Keep balance work at floor level.</p></details>`:''}${done?qbTrainingBonusCard(a):''}`:''}
 </section>`;
}
function qbTrainingOptionalCard(){
 return `<section class="card qb-plan-options"><p class="eyebrow">OPTIONAL TRAINING</p><h2>Choose Your Adventure</h2><p>Bodyweight workouts advance your strength plan. Climbing and cardio count toward weekly workout bonuses and leave your next strength session waiting for you.</p><label>Session location<select id="qbExtraLocation"><option value="gym">Gym / climbing gym</option><option value="home">Home</option><option value="outdoors">Outdoors</option></select></label><div class="qb-inline-actions"><button data-extra-session="bodyweight" class="ghost">Bodyweight Workout</button><button data-extra-session="climb" class="ghost">Climbing</button><button data-extra-session="conditioning" class="ghost">Cardio / Walk</button><button data-extra-session="recovery" class="ghost">Recovery</button></div></section>`;
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
const qbRenderTrainingBeforePlan=renderTraining;
renderTraining=function(){
 const p=state.trainingPlan;if(!p)return qbRenderTrainingBeforePlan();
 // Keep the established Rider/Witcher artwork and header treatment.
 qbRenderTrainingBeforePlan();const heroNode=screen.querySelector('.training-hero');const subtitle=heroNode?.querySelectorAll('p').item(heroNode.querySelectorAll('p').length-1);if(subtitle)subtitle.textContent=state.membership.player_key==='Drew'?'Trials of the Path · two full-body sessions, at your pace.':'Basgiath Rider Induction · two full-body sessions, at your pace.';const hero=heroNode?.outerHTML||'';
 const a=qbTrainingToday(),chosen=a?.gym_upgrade?.plan_version===1;
 screen.innerHTML=hero+qbGymSummaryCard()+`<div class="qb-plan-columns">${qbTrainingSessionCard(chosen?a:null)}<div><section class="card qb-plan-record"><p class="eyebrow">TRAINING RECORD</p><h2>${fmt(p.completed_sessions)} strength sessions</h2>${qbTrainingStatBars()}<p class="fine">Two sessions a week is the target. Ideally leave a recovery day between full-body sessions. Add weight or repetitions gradually; no missed-day penalties.</p></section>${!a?.completed_at?qbTrainingOptionalCard():''}<details class="card qb-plan-history"><summary>Recent Training Logs</summary>${(p.history||[]).filter(h=>h.completed_at).map(h=>`<div class="qb-plan-history-row"><b>${esc(h.title)}</b><small>${esc(h.assignment_date)} · ${esc(qbTrainingLocationLabel(h.gym_upgrade))}</small>${(h.gym_upgrade.logs||[]).map(l=>`<p>${esc(h.gym_upgrade.exercises?.find(e=>e.id===l.id)?.name||l.id)}: ${l.sets.filter(s=>s.reps!=null).map(s=>`${esc(s.weight??'BW')}${s.weight!=null?' lb':''} × ${esc(s.reps)}`).join(' · ')||'No load recorded'}</p>`).join('')}${h.gym_upgrade.notes?`<p>${esc(h.gym_upgrade.notes)}</p>`:''}</div>`).join('')||'<p>No completed plan sessions yet.</p>'}</details></div></div>`;
 if(a?.completed_at&&!chosen){screen.querySelector('.qb-plan-contract').innerHTML=`<p class="eyebrow">TODAY’S TRAINING</p><h2>✓ ${esc(a.title)}</h2><p>Today’s workout is complete. Start the new plan on your next workout day.</p>`}
 qbApplyRidersQuadrantVisualV20();if(typeof qbApplyWitcherLogo==='function')qbApplyWitcherLogo();
 screen.querySelectorAll('[data-prepare-plan]').forEach(b=>b.onclick=()=>qbPreparePlan('plan',b.dataset.preparePlan==='short',screen.querySelector('#qbPlanLocation').value));
 screen.querySelectorAll('[data-extra-session]').forEach(b=>b.onclick=()=>qbPreparePlan(b.dataset.extraSession,false,screen.querySelector('#qbExtraLocation').value));
 screen.querySelector('#qbSaveTrainingLog')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{await qbSavePlanLog(a);await qbLoadTrainingPlan()}catch(e){alert(e.message)}finally{b.disabled=false}});
 screen.querySelector('#qbPlanComplete')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{await qbSavePlanLog(a,false);await qbCompleteTraining(a)}catch(e){alert(e.message)}finally{if(b.isConnected)b.disabled=false}});
 screen.querySelector('#qbChangeTraining')?.addEventListener('click',()=>{qbModal(`<p class="eyebrow">CHANGE TODAY’S SESSION</p><h2>Choose a version</h2><p>Your saved log stays with an equivalent strength session. Changing workout types clears that draft log.</p><label>Location<select id="qbChangeLocation"><option value="gym" ${a.gym_upgrade.gym_visit?'selected':''}>Gym</option><option value="home" ${a.gym_upgrade.location==='home'||!a.gym_upgrade.gym_visit&&!a.gym_upgrade.location?'selected':''}>Home</option><option value="outdoors" ${a.gym_upgrade.location==='outdoors'?'selected':''}>Outdoors</option></select></label><div class="stack"><button data-change-kind="full">Full strength session</button><button data-change-kind="short">Busy-day strength session</button><button data-change-kind="bodyweight">Bodyweight workout</button><button data-change-kind="climb">Climbing</button><button data-change-kind="conditioning">Cardio / Walk</button><button data-change-kind="recovery">Recovery</button><button class="ghost" data-qb-modal-close>Cancel</button></div>`);document.querySelectorAll('[data-change-kind]').forEach(b=>b.onclick=async()=>{const k=b.dataset.changeKind,location=document.querySelector('#qbChangeLocation').value;document.querySelector('.qb-modal')?.remove();await qbPreparePlan(k==='full'?'plan':k==='short'?(a.gym_upgrade.variant==='bodyweight'?'bodyweight':'plan'):k,k==='short',location)})});
 screen.querySelector('#qbClaimWorkoutBonus')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{const {data,error}=await sb.rpc('claim_training_bonus',{p_assignment_id:a.id,p_reason:screen.querySelector('#qbWorkoutBonusReason').value});if(error)throw error;showToast(`Extra effort · +${data.personal_xp} XP · +${data.campaign_xp} Campaign`);await qbReloadCore()}catch(e){alert(e.message);b.disabled=false}});
};
