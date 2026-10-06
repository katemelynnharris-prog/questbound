// === Questbound canonical feature restoration: single renderer only ===
const QB_SPEC = {
  Archivist:{desc:'Knowledge, reading, study, and writing.',abilities:['Deep Study','Research Expedition']},
  Vanguard:{desc:'Training, resilience, and physical trials.',abilities:['Second Wind','Battle Rhythm']},
  Pathfinder:{desc:'Exploration, Renown, and discovery.',abilities:['Cartographer','Farther Roads']},
  Steward:{desc:'Home, finance, and keeping the Guild strong.',abilities:['Good Order','Guild Provisioner']}
};
const QB_SLOTS=['Helm','Chest','Gauntlets','Weapon I','Weapon II','Leggings','Relic I','Boots','Relic II'];
function qbSlot(raw){const s=String(raw||'').toLowerCase();return({head:'Helm',helm:'Helm',chest:'Chest',hands:'Gauntlets',main_hand:'Weapon I',off_hand:'Weapon II',legs:'Leggings',feet:'Boots',charm:'Relic I',relic2:'Relic II'}[s]||raw||'—')}
function qbItemDef(item){return (state.itemDefs||[]).find(d=>d.key===item?.item_key)||null}
function qbItemName(item){const d=qbItemDef(item),m=safeMeta(item?.metadata);return m.name||d?.name||String(item?.item_key||'Unknown Item').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function qbMechanicsText(mechanics){const m=safeMeta(mechanics),a=[];if(m.defense)a.push(`+${m.defense} Defense`);if(m.ward_pct)a.push(`+${m.ward_pct}% Ward`);if(m.fortune)a.push(`+${m.fortune} Fortune`);if(m.training_xp_pct)a.push(`+${m.training_xp_pct}% Training XP`);if(m.exploration_xp_pct)a.push(`+${m.exploration_xp_pct}% Exploration XP`);if(m.third_expedition_renown)a.push(`+${m.third_expedition_renown} Renown every 3rd expedition`);if(m.gauntlet_xp_pct)a.push(`+${m.gauntlet_xp_pct}% Gauntlet XP`);if(m.witcher_trial_xp_pct)a.push(`+${m.witcher_trial_xp_pct}% Witcher Trial XP`);if(m.treasury_mitigation)a.push('Blocks one Treasury withdrawal penalty');if(m.gauntlet)a.push('Throw one spouse Gauntlet');if(m.effect?.pct)a.push(`+${Math.round(m.effect.pct*100)}% Campaign XP · ${m.effect.uses||1} uses`);return a.join(' · ')}
function qbItemStats(item){const d=qbItemDef(item),m=safeMeta(item?.metadata);return qbMechanicsText(d?.mechanics||m.mechanics||m.effect||{})}
function qbMemberName(uid){return memberByUser(uid)?.player_key||'Guild'}
function qbRefreshCurrent(){renderCampaignStrip();render()}
async function qbReloadCore(){await loadAll();state.campaign=state.campaigns.find(c=>c.status==='active'||c.status==='victory')||null;renderCampaignStrip();render()}

async function loadItemDefinitions(){const {data,error}=await sb.from('item_definitions').select('*').eq('active',true).order('kind').order('rarity').order('name');if(error)throw error;state.itemDefs=data||[]}
async function loadTreasuryTransactions(){if(!state.treasury){state.treasuryTransactions=[];return}const {data,error}=await sb.from('treasury_transactions').select('*').eq('fund_id',state.treasury.id).order('created_at',{ascending:false}).limit(10);if(error)throw error;state.treasuryTransactions=data||[]}
async function loadAll(){
  state.itemDefs=state.itemDefs||[];state.treasuryTransactions=state.treasuryTransactions||[];
  const jobs=[loadMembers(),loadProfile(),loadCampaigns(),loadPlayers(),loadQuests(),loadCompletions(),loadActivity(),loadTreasury(),loadFate(),loadWeekly(),loadGuildItems(),loadPlayerItems(),loadGauntlets(),loadTraining(),loadItemDefinitions()];
  if(typeof loadTrainingStats==='function')jobs.push(loadTrainingStats());
  if(typeof loadSpecializations==='function')jobs.push(loadSpecializations());
  if(typeof loadExploration==='function')jobs.push(loadExploration());
  if(typeof loadExpeditions==='function')jobs.push(loadExpeditions());
  await Promise.all(jobs.map(p=>p.catch(e=>console.warn(e))));
  state.campaign=state.campaigns.find(c=>c.status==='active'||c.status==='victory')||null;
  await Promise.all([loadContributions().catch(e=>console.warn(e)),loadTreasuryTransactions().catch(e=>console.warn(e))]);
}

function streakCard(){
  const kate=memberByKey('Kate'),drew=memberByKey('Drew'),locked=drewLockedData();
  const ks=kate?playerStreak(kate.user_id):0,ds=drew?playerStreak(drew.user_id):0;
  const kdays=new Set(state.completions.filter(c=>!c.reversed_at&&kate&&(c.completed_by===kate.user_id||c.subject_user_id===kate.user_id)).map(c=>c.effective_date||localDate(new Date(c.completed_at))));
  const ddays=new Set(state.completions.filter(c=>!c.reversed_at&&drew&&(c.completed_by===drew.user_id||c.subject_user_id===drew.user_id)).map(c=>c.effective_date||localDate(new Date(c.completed_at))));
  const party=streakFromSet(new Set([...kdays].filter(d=>ddays.has(d))));
  return `<section class="card home-card"><p class="eyebrow">🔥 STREAKS</p><div class="streak-grid four"><div><span>Kate</span><b>${ks}</b><small>questing days</small></div><div><span>Drew</span><b>${ds}</b><small>questing days</small></div><div><span>Party</span><b>${party}</b><small>shared days</small></div><div><span>Drew · Locked In</span><b>${locked.streak}</b><small>${locked.secured?'Secured Today':'Protein + Calories'}</small></div></div></section>`;
}
function weeklyRoadCard(){
  const w=state.weekly,wm=safeMeta(w?.metadata),wp=w?progressPct(w.progress,w.target):0;
  const overspend=state.quests.find(q=>q.key==='no-overspending-week');
  const overDone=overspend?isCompletedForCurrentOccurrence(overspend):false;
  return `<section class="card home-card weekly-card qb-weekly-only"><div class="weekly-block"><p class="eyebrow">🛡 WEEKLY CHALLENGE</p><h2>${esc(w?.title||'The board is being prepared.')}</h2><p>${esc(wm.description||'A new challenge arrives each Monday.')}</p>${w?`<div class="progress"><span style="width:${wp}%"></span></div><div class="progress-meta"><b>${fmt(w.progress)} / ${fmt(w.target)} ${esc(w.unit)}</b><span>Completion bounty +${fmt(wm.reward_campaign_xp||0)} Campaign XP</span></div><button class="mini" id="weeklyLogBtn" ${w.completed_at?'disabled':''}>${w.completed_at?'✓ Challenge Complete':'＋ Log Progress'}</button>`:''}</div>${overspend?`<div class="weekly-block"><p class="eyebrow">💰 WEEKLY CO-OP</p><h2>${esc(overspend.title)}</h2><p>${esc(overspend.objective||'Keep spending within the agreed plan for the full week.')}</p><div class="quest-meta">+${fmt(overspend.xp_personal)} Personal XP each · +${fmt(overspend.xp_campaign)} Campaign XP</div><button data-complete="${overspend.id}" data-source="journal" ${overDone?'disabled':''}>${overDone?'✓ Week Secured':'Complete Week'}</button></div>`:''}</section>`;
}
function permanentDailyCard(){
  const qs=state.quests.filter(q=>(q.owner_type==='personal_daily'||(q.owner_type==='co-op'&&safeMeta(q.recurrence).type==='daily'))&&canOwnQuest(q));
  return `<section class="card home-card qb-daily-card"><div class="card-head"><div><p class="eyebrow">☀ DAILY LEDGER</p><h2>Always Available</h2></div><span class="count-pill">${qs.filter(q=>isCompletedForCurrentOccurrence(q)).length} / ${qs.length}</span></div><div class="qb-daily-grid">${qs.map(q=>questRow(q,{compact:true})).join('')||'<div class="empty-inline">No personal dailies are visible.</div>'}</div></section>`;
}
function activityList(limit=12){const list=state.activity.slice(0,limit);return `<div class="activity">${list.map(a=>{const actor=qbMemberName(a.actor_user_id),target=a.target_user_id&&a.target_user_id!==a.actor_user_id?` → ${qbMemberName(a.target_user_id)}`:'';return `<div class="activity-row"><div><b>${esc(actor+target)} · ${esc(a.message||a.event_type)}</b>${safeMeta(a.metadata).fate?`<span class="fate-used">🃏 ${esc(safeMeta(a.metadata).fate)}</span>`:''}</div><small>${new Date(a.created_at).toLocaleString()}${a.personal_xp?` · ${a.personal_xp>0?'+':''}${a.personal_xp} XP`:''}${a.campaign_xp?` · ${a.campaign_xp>0?'+':''}${a.campaign_xp} Campaign`:''}</small></div>`}).join('')||'<div class="empty-inline">No Guild activity yet.</div>'}</div>`}
function campaignHome(){
  const c=activeCampaign();if(!c)return `<section class="card campaign-home"><p class="eyebrow">⚔ CURRENT CAMPAIGN</p><h2>No campaign is active.</h2></section>`;
  const pct=progressPct(c.campaign_xp,c.goal_xp),ch=chapterAt(pct),toNext=Math.max(0,Number(c.goal_xp)-Number(c.campaign_xp));
  const chapters=CHAPTERS.slice(1).map(x=>`<div class="chapter ${pct>=x.pct?'reached':''} ${pct+20<x.pct?'locked':''}"><b>${esc(x.name)}</b><span>${esc(x.sub)}</span></div>`).join('');
  const victory=(c.status==='victory'||Number(c.campaign_xp)>=Number(c.goal_xp))&&!c.reward_claimed_at;
  return `<section class="card campaign-home"><div class="campaign-titleline"><div><p class="eyebrow">⚔ CURRENT CAMPAIGN</p><h2>${esc(c.name)}</h2><h3>${esc(ch.name)}</h3><p>${esc(ch.sub)}</p></div><strong>${fmt(c.campaign_xp)} / ${fmt(c.goal_xp)} XP</strong></div><div class="progress campaign-progress"><span style="width:${pct}%"></span></div><div class="chapter-grid qb-six-chapters">${chapters}</div><div class="campaign-foot"><b>${Math.floor(pct)}% conquered</b><span>${toNext?`${fmt(toNext)} XP to The Burden Ends`:'The Hall awaits.'}</span></div>${victory?`<div class="qb-victory-callout"><div><p class="eyebrow">🏆 CAMPAIGN VICTORY</p><h3>The Burden Ends</h3><p>Claim the victory, archive this Campaign, and place its record in the Hall of History.</p></div><button id="qbClaimCampaign">Claim Victory & Enter the Hall</button></div>`:''}</section>`;
}
function renderHome(){
  screen.innerHTML=`<div class="home-mast"><div><p class="eyebrow">KATE & DREW'S SHARED CAMPAIGN</p></div><div class="date-banner"><b>${esc(localPrettyDate())}</b><span>${esc(seasonName())} roads are open.</span></div></div>${campaignHome()}<div class="players-grid">${playerCard('Kate')}${playerCard('Drew')}</div><div class="home-two independent">${streakCard()}${vaultEffectsCard()}</div>${permanentDailyCard()}<div class="home-two independent">${fateCard()}${questWatchCard()}</div>${randomCard()}${weeklyRoadCard()}<div class="home-two independent">${treasuryCard()}${activityCard()}</div>`;
  wireQuestButtons();wireHomeButtons();wireCharacterButtons();qbWireCampaign();qbMaybeVictoryFanfare();
}
function qbWireCampaign(){document.querySelector('#qbClaimCampaign')?.addEventListener('click',qbClaimCampaign)}
async function qbClaimCampaign(){const b=document.querySelector('#qbClaimCampaign');if(b)b.disabled=true;const {data,error}=await sb.rpc('claim_campaign_victory');if(error){if(b)b.disabled=false;return alert(error.message)}showToast(`🏆 ${data?.campaign_name||'Campaign'} archived · Victory Cache awarded`);await loadAll();state.tab='Hall of History';renderNav();renderCampaignStrip();renderHall()}
function qbMaybeVictoryFanfare(){const c=state.campaign;if(!c||!(c.status==='victory'||Number(c.campaign_xp)>=Number(c.goal_xp))||c.reward_claimed_at)return;const key=`qb-victory:${c.id}`;if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');setTimeout(()=>qbModal(`<p class="eyebrow">🏆 CAMPAIGN VICTORY</p><div class="qb-modal-mark">🏆</div><h2>The Burden Ends</h2><p>${esc(c.name)} has reached ${fmt(c.goal_xp)} Campaign XP.</p><button data-qb-modal-claim>Claim Victory & Enter the Hall</button><button class="ghost" data-qb-modal-close>View the board first</button>`),50)}
function qbModal(html){document.querySelector('.qb-modal')?.remove();const m=document.createElement('div');m.className='qb-modal';m.innerHTML=`<div class="qb-dialog">${html}</div>`;document.body.appendChild(m);m.querySelector('[data-qb-modal-close]')?.addEventListener('click',()=>m.remove());m.querySelector('[data-qb-modal-claim]')?.addEventListener('click',()=>{m.remove();qbClaimCampaign()});m.addEventListener('click',e=>{if(e.target===m)m.remove()})}
