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
renderHome=function(){qbHomeBeforeAbilityControls();screen.querySelector('.home-mast')?.insertAdjacentHTML('afterend',qbFocusCard());wireQuestButtons();qbWireFocus();const f=state.legendaryDraw;if(f?.unlocked)screen.querySelector('.home-mast')?.insertAdjacentHTML('beforeend',`<p class="qb-personal-fate">✦ Legendary Draw · ${f.ready?'Rare Fortune ready: +25% base XP on your next quest today':f.used?'Rare Fortune used today':'Quiet personal draw today'}.</p>`)};
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
