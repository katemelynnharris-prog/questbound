// Transitional parity bridge: patches the production state adapter while V24.10 systems
// are folded into the canonical production client. This file intentionally keeps the
// authenticated Supabase state layer and restores approved Questbound presentation/UX.

const base = await fetch(`./app.js?v=20261003-1935`, { cache: 'no-store' });
if (!base.ok) throw new Error(`Unable to load Questbound client (${base.status})`);
let src = await base.text();

function swap(startMarker, endMarker, replacement) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Questbound parity bridge could not find ${startMarker}`);
  src = src.slice(0, start) + replacement + src.slice(end);
}

swap('const CHAPTERS = [', '\n\nconst RANKS = [', `const CHAPTERS = [
  {pct:0,key:'road-from-home',name:'The Road from Home',sub:'The first step is small, but it changes the road ahead.'},
  {pct:20,key:'prancing-lantern',name:'The Prancing Lantern',sub:'A brief refuge reveals how much road still lies ahead.'},
  {pct:40,key:'crossroads',name:'Council at the Crossroads',sub:'The path is chosen. There is no easy road from here.'},
  {pct:60,key:'beneath-mountain',name:'Beneath the Mountain',sub:'The safe road is behind you. The way forward descends into darkness.'},
  {pct:80,key:'deadlands',name:'Through the Deadlands',sub:'The destination is close enough to feel—and dangerous enough to matter.'},
  {pct:90,key:'burning-mountain',name:'Ascending the Burning Mountain',sub:'The final climb has begun. Finish what the Guild set out to do.'},
  {pct:100,key:'burden-ends',name:'The Burden Ends',sub:'The long road is complete. The Hall awaits.'}
];`);

src = src.replace(
  "fate:null, weekly:null, road:null, roadEntries:[], guildItems:[], playerItems:[], gauntlets:[], training:[],",
  "fate:null, weekly:null, road:null, roadEntries:[], guildItems:[], playerItems:[], gauntlets:[], training:[], trainingStats:null,"
);

src = src.replace(
  "const cycle = await sb.rpc('ensure_home_cycles');\n  if(cycle.error) console.warn('Home cycle initialization:',cycle.error.message);\n  await loadAll();",
  "const cycle = await sb.rpc('ensure_home_cycles');\n  if(cycle.error) console.warn('Home cycle initialization:',cycle.error.message);\n  const trainingCycle = await sb.rpc('ensure_training_assignment');\n  if(trainingCycle.error) console.warn('Training assignment initialization:',trainingCycle.error.message);\n  await loadAll();"
);

src = src.replace(
  "loadGuildItems(),loadPlayerItems(),loadGauntlets(),loadTraining()]",
  "loadGuildItems(),loadPlayerItems(),loadGauntlets(),loadTraining(),loadTrainingStats()]"
);

swap('async function loadTraining(){', '\n\nfunction renderNav(){', `async function loadTraining(){
  const {data,error}=await sb.from('training_assignments').select('*').eq('guild_id',state.membership.guild_id).eq('user_id',ownUserId()).order('assignment_date',{ascending:false}).limit(10);
  if(error) throw error; state.training=data||[];
}
async function loadTrainingStats(){
  const {data,error}=await sb.from('training_stats').select('*').eq('guild_id',state.membership.guild_id).eq('user_id',ownUserId()).maybeSingle();
  if(error) throw error; state.trainingStats=data;
}`);

swap('function questWatchCard(){', '\n\nfunction seededHash', `function questWatchCard(){
  const qs=questWatchItems();
  return \`<section class="card home-card"><p class="eyebrow">⏳ QUEST WATCH</p><h2>Deadlines & rhythms</h2><div class="watch-list">\${qs.map(q=>{
    const done=isCompletedForCurrentOccurrence(q), eligible=canOwnQuest(q);
    return \`<div class="watch-row"><div><b>\${esc(q.title)}</b><span>\${esc(recurrenceLabel(q))} · \${esc(ownerLabel(q))}</span></div><button data-complete="\${q.id}" data-source="journal" class="mini" \${done||!eligible?'disabled':''}>\${done?'✓ Done':eligible?'Complete':'Assigned to spouse'}</button></div>\`;
  }).join('')||'<div class="empty-inline">No urgent visible quests right now.</div>'}</div></section>\`;
}`);

swap('function renderCharacter(){', '\nfunction abilityDescription', `function renderCharacter(){
  const {uid,member,progress}=selectedCharacter();
  const key=member?.player_key||'Adventurer', own=uid===ownUserId(), xp=Number(progress?.personal_xp||0), level=progress?.level||levelFor(xp), rank=rankFor(level), sprite=key==='Drew'?'./assets/drew.svg':'./assets/kate.svg';
  const items=playerItemsVisible(uid), equipped=items.filter(i=>i.state==='equipped'), pack=own?items.filter(i=>i.state!=='equipped'):[];
  const slots=[
    ['head','Head','◈'],['chest','Chest','◇'],['hands','Hands','✦'],['weapon','Main Hand','⚔'],
    ['offhand','Off Hand','🛡'],['legs','Legs','◆'],['feet','Feet','⌁'],['charm','Charm','✧']
  ];
  const aliases={main_hand:'weapon','main-hand':'weapon',off_hand:'offhand','off-hand':'offhand',boots:'feet',helm:'head',helmet:'head',body:'chest'};
  const slotItem=(slot)=>equipped.find(i=>(aliases[i.equipped_slot]||i.equipped_slot)===slot);
  const itemName=(i)=>safeMeta(i?.metadata).name || String(i?.item_key||'').replaceAll('-',' ').replace(/\\b\\w/g,c=>c.toUpperCase());
  const gear=slots.map(([slot,label,icon])=>{const i=slotItem(slot); const rarity=safeMeta(i?.metadata).rarity||''; return \`<div class="gear-slot \${i?'filled':'empty-slot'}"><span class="gear-icon">\${icon}</span><small>\${label}</small><b>\${i?esc(itemName(i)):'Empty'}</b>\${i&&rarity?\`<em>\${esc(rarity)}</em>\`:''}</div>\`;}).join('');
  screen.innerHTML=\`<section class="character-hero" style="--rank:\${rank.color}"><div class="character-art"><img src="\${sprite}" alt="\${esc(key)} sprite"></div><div><p class="eyebrow">\${esc(rank.name)} · LEVEL \${level}</p><h1>\${esc(key)}</h1><p>\${fmt(xp)} Personal XP · Defense \${fmt(progress?.defense||0)} · Ward \${fmt(progress?.ward||0)} · Fortune \${fmt(progress?.fortune||0)}</p><div class="character-tabs"><span class="active">Overview</span><span>Loadout</span><span>Pack</span><span>Abilities</span><span>Specializations</span><span>Stats</span><span>Achievements</span><span>History</span></div></div></section>
  <section class="card loadout-panel"><div class="loadout-title"><div><p class="eyebrow">⚔ LOADOUT</p><h2>Equipped Gear</h2></div><span class="count-pill">\${equipped.length} / 8 slots</span></div><div class="gear-grid">\${gear}</div><p class="fine">Only equipped gear is visible to your Guild partner. Your Pack remains private.</p></section>
  <div class="home-two"><section class="card home-card"><p class="eyebrow">✦ ABILITY</p><h2>\${esc(rank.ability)}</h2><p>\${abilityDescription(rank.key)}</p></section><section class="card home-card"><p class="eyebrow">🛡 CHARACTER STATS</p><div class="character-stat-grid"><span><b>\${fmt(progress?.defense||0)}</b><small>Defense</small></span><span><b>\${fmt(progress?.ward||0)}</b><small>Ward</small></span><span><b>\${fmt(progress?.fortune||0)}</b><small>Fortune</small></span><span><b>\${playerStreak(uid)}</b><small>Streak</small></span></div></section></div>
  \${own?\`<section class="card home-card"><p class="eyebrow">🎒 PACK</p><h2>\${pack.length} personal item\${pack.length===1?'':'s'}</h2>\${pack.length?\`<div class="pack-grid">\${pack.map(i=>\`<div class="pack-item"><b>\${esc(itemName(i))}</b><span>\${esc(i.state||'carried')}</span></div>\`).join('')}</div>\`:'<div class="empty-inline">Your Pack is empty. Rare loot should feel rare.</div>'}<p class="fine">Personal inventory is visible only to you.</p></section>\`:''}\`;
}`);

swap('function renderTraining(){', '\n\nfunction ownerLabel', `function renderTraining(){
  const mine=state.training.find(t=>t.assignment_date===localDate()) || state.training[0];
  const title=trainingLabel(), stats=state.trainingStats||{};
  const deltas=safeMeta(mine?.stat_deltas), gym=safeMeta(mine?.gym_upgrade), completed=!!mine?.completed_at;
  const statCards=[['Strength',stats.strength||0],['Endurance',stats.endurance||0],['Agility',stats.agility||0],['Mobility',stats.mobility||0],['Core / Power',stats.core_power||0],['Grip / Climbing',stats.grip_climbing||0]];
  const deltaText=Object.entries(deltas).map(([k,v])=>\`<span class="delta-chip">+\${v} \${esc(k.replaceAll('_',' '))}</span>\`).join('');
  screen.innerHTML=\`<section class="training-hero \${state.membership.player_key==='Drew'?'witcher':'rider'}"><p class="eyebrow">TRAINING PATH</p><h1>\${esc(title)}</h1><p>\${state.membership.player_key==='Drew'?'Trials of the Path · bodyweight and running first, with optional Gym Upgrades.':"12 Weeks to Threshing · strength, climbing, conditioning, mobility, and core power."}</p></section>
  <div class="training-layout"><section class="card training-assignment"><div class="assignment-head"><div><p class="eyebrow">TODAY'S ASSIGNMENT</p><h2>\${esc(mine?.title||'No assignment drawn yet')}</h2></div>\${completed?'<span class="status-chip complete">✓ Complete</span>':''}</div><p class="training-objective">\${esc(mine?.objective||'Draw an assignment to begin.')}</p>\${mine?\`<div class="training-rewards"><b>+\${mine.xp_personal} Personal XP</b><b>+\${mine.xp_campaign} Campaign XP</b></div><div class="delta-row">\${deltaText}</div>\${gym.text?\`<details class="gym-upgrade"><summary>\${esc(gym.label||'Gym Upgrade')}</summary><p>\${esc(gym.text)}</p></details>\`:''}<button id="completeTrainingBtn" class="training-complete" \${completed?'disabled':''}>\${completed?'Training Complete':'Complete Training'}</button>\`:'<button id="drawTrainingBtn" class="training-complete">Draw Today’s Assignment</button>'}</section>
  <section class="card training-progress"><p class="eyebrow">RIDER PROGRESSION</p><div class="session-count"><b>\${fmt(stats.training_sessions||0)}</b><span>Training Sessions</span></div><div class="training-stat-grid">\${statCards.map(([n,v])=>\`<div><span>\${esc(n)}</span><b>\${fmt(v)}</b><div class="mini-stat"><i style="width:\${Math.min(100,Number(v)*8)}%"></i></div></div>\`).join('')}</div></section></div>
  <section class="card training-note"><p class="eyebrow">THE RULE OF THE PATH</p><h2>Daily-accessible does not mean daily-required.</h2><p>One or two substantive sessions in a week is a good week. Recovery, mobility, easy runs, and conditioning still count when they serve real life instead of fighting it.</p></section>\`;
  $('#completeTrainingBtn')?.addEventListener('click',()=>completeTraining(mine.id));
  $('#drawTrainingBtn')?.addEventListener('click',ensureTrainingNow);
}
async function ensureTrainingNow(){
  const {error}=await sb.rpc('ensure_training_assignment'); if(error)return alert(error.message);
  await Promise.all([loadTraining(),loadTrainingStats()]); renderTraining();
}
async function completeTraining(id){
  const btn=$('#completeTrainingBtn'); if(btn)btn.disabled=true;
  const {data,error}=await sb.rpc('complete_training_assignment',{p_assignment_id:id});
  if(error){ if(btn)btn.disabled=false; return alert(error.message); }
  showToast(\`✓ Training complete · +\${data.personal_xp} XP · +\${data.campaign_xp} Campaign\`);
  await Promise.all([loadTraining(),loadTrainingStats(),loadPlayers(),loadCampaigns(),loadActivity()]);
  state.campaign=state.campaigns.find(c=>c.status==='active'||c.status==='victory')||null;
  await loadContributions().catch(()=>{}); renderCampaignStrip(); renderTraining();
}`);

swap('function renderJournal(){', '\nfunction wireQuestButtons', `function dailyLedgerQuests(){
  return state.quests.filter(q=>canOwnQuest(q) && (q.owner_type==='personal_daily' || q.recurrence?.type==='daily')).sort((a,b)=>a.title.localeCompare(b.title));
}
function dailyLedgerCard(){
  const qs=dailyLedgerQuests();
  return \`<section class="card daily-ledger"><p class="eyebrow">☀ DAILY LEDGER</p><h2>Always Available</h2><div class="daily-grid">\${qs.map(q=>{const done=isCompletedForCurrentOccurrence(q);return \`<div class="daily-quest"><div><b>\${done?'✓ ':''}\${esc(q.title)}</b><span>\${esc(ownerLabel(q))} · +\${fmt(q.xp_personal)} personal · +\${fmt(q.xp_campaign)} campaign</span></div><button data-complete="\${q.id}" data-source="journal" \${done?'disabled':''}>\${done?'Done':'Complete'}</button></div>\`;}).join('')||'<div class="empty-inline">No daily quests are available to this character.</div>'}</div></section>\`;
}
function renderJournal(){
  const dailyIds=new Set(dailyLedgerQuests().map(q=>q.id));
  const cats=['All',...new Set(state.quests.map(q=>q.category))];
  const filtered=state.questFilter==='All'?state.quests:state.quests.filter(q=>q.category===state.questFilter);
  const qs=filtered.filter(q=>!dailyIds.has(q.id));
  screen.innerHTML=\`<section class="ledger-head"><p class="eyebrow">THE GUILD LEDGER</p><h1>Quest Journal</h1><p>\${fmt(state.quests.length)} active visible quests. Hidden surprise and secret subplot pools remain server-side.</p></section>\${dailyLedgerCard()}\${questWatchCard()}<div class="filterbar">\${cats.map(c=>\`<button class="\${state.questFilter===c?'active':''}" data-filter="\${esc(c)}">\${esc(c)}</button>\`).join('')}</div><div class="quest-list journal-list">\${qs.map(q=>questRow(q)).join('')}</div>\`;
  screen.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.questFilter=b.dataset.filter;renderJournal();});
  wireQuestButtons(); wireHomeButtons();
}`);

const blob = new Blob([src], { type: 'text/javascript' });
const url = URL.createObjectURL(blob);
try {
  await import(url);
} finally {
  URL.revokeObjectURL(url);
}
