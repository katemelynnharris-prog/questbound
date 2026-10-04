const SUPABASE_URL = 'https://zzvqruhfgjocnwffavcb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-nq-Po_ytT0E6uM8vmp1zw_FPftRDVN';
const APP_URL = 'https://katemelynnharris-prog.github.io/questbound/';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s) => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt = n => Number(n || 0).toLocaleString();
const money = n => Number(n || 0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

const CHAPTERS = [
  {pct:0,key:'road-from-home',name:'The Road from Home',sub:'The first step is small, but it changes the road ahead.'},
  {pct:20,key:'prancing-lantern',name:'The Prancing Lantern',sub:'A brief refuge reveals how much road still lies ahead.'},
  {pct:40,key:'crossroads',name:'Council at the Crossroads',sub:'The path is chosen. There is no easy road from here.'},
  {pct:60,key:'beneath-mountain',name:'Beneath the Mountain',sub:'The safe road is behind you. The way forward descends into darkness.'},
  {pct:80,key:'burning-mountain',name:'Ascending the Burning Mountain',sub:'The final climb has begun. Finish what the Guild set out to do.'},
  {pct:100,key:'burden-ends',name:'The Burden Ends',sub:'The long road is complete. The Hall awaits.'}
];

const RANKS = [
  {min:1,max:4,key:'initiate',name:'Initiate',color:'#7b817a',ability:'The Ledger'},
  {min:5,max:9,key:'cadet',name:'Cadet',color:'#66875b',ability:'Second Wind'},
  {min:10,max:14,key:'crawler',name:'Crawler',color:'#547da0',ability:'Loot Find'},
  {min:15,max:19,key:'rider',name:'Rider',color:'#8266a0',ability:'Signet'},
  {min:20,max:24,key:'pathfinder',name:'Pathfinder',color:'#b58b3f',ability:'Rested'},
  {min:25,max:29,key:'witcher',name:'Witcher',color:'#a56a3d',ability:"Witcher's Contract"},
  {min:30,max:39,key:'champion',name:'Champion',color:'#a94f45',ability:'Rally'},
  {min:40,max:49,key:'wingleader',name:'Wingleader',color:'#9da7b1',ability:"Commander's Favor"},
  {min:50,max:59,key:'grandmaster',name:'Grandmaster',color:'#c8b56b',ability:'Masterwork'},
  {min:60,max:74,key:'commander',name:'Commander',color:'#7c89a9',ability:'War Council'},
  {min:75,max:99,key:'ascendant',name:'Ascendant',color:'#9d78a9',ability:'Legendary Draw'},
  {min:100,max:9999,key:'legend',name:'Legend',color:'#d8c07a',ability:'Prestige'}
];

const state = {
  session:null, membership:null, guild:null, profile:null, members:[], campaigns:[], campaign:null,
  contributions:[], players:[], quests:[], completions:[], activity:[], treasury:null,
  fate:null, weekly:null, road:null, roadEntries:[], guildItems:[], playerItems:[], gauntlets:[], training:[],
  tab:'Home', questFilter:'All', characterUserId:null
};

const authView=$('#authView'), guildGate=$('#guildGate'), gameView=$('#gameView');
const authForm=$('#authForm'), authMessage=$('#authMessage'), signOutBtn=$('#signOutBtn');
const screen=$('#screen'), mainNav=$('#mainNav'), campaignStrip=$('#campaignStrip'), sessionLabel=$('#sessionLabel');

function show(which){
  authView.classList.add('hidden'); guildGate.classList.add('hidden'); gameView.classList.add('hidden');
  which.classList.remove('hidden');
}
function trainingLabel(){ return state.membership?.player_key === 'Drew' ? 'Witcher Trials' : "Rider's Quadrant"; }
function navItems(){ return ['Home','Guild','Character',trainingLabel(),'Quest Journal','Map','Calendar','Hall of History','Guild Admin']; }
function progressPct(x,g){ return clamp(g?Number(x||0)/Number(g)*100:0,0,100); }
function levelFor(xp){ return 1 + Math.floor(Math.sqrt(Math.max(0,Number(xp||0))/150)); }
function rankFor(level){ return RANKS.find(r=>level>=r.min&&level<=r.max) || RANKS.at(-1); }
function levelMinXp(level){ return 150*Math.pow(Math.max(0,level-1),2); }
function nextLevelXp(level){ return 150*Math.pow(level,2); }
function prettyRank(key,level){ const r=rankFor(level); return r?.name || String(key||'Initiate').replace(/\b\w/g,c=>c.toUpperCase()); }
function currentTimeZone(){ return state.guild?.timezone || 'America/Chicago'; }
function localDate(d=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:currentTimeZone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const o=Object.fromEntries(parts.map(p=>[p.type,p.value])); return `${o.year}-${o.month}-${o.day}`;
}
function localPrettyDate(){ return new Intl.DateTimeFormat('en-US',{timeZone:currentTimeZone(),weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date()); }
function seasonName(){ const m=Number(localDate().slice(5,7)); return m===12||m<=2?'Winter':m<=5?'Spring':m<=8?'Summer':'Autumn'; }
function weekKey(){ const d=new Date(localDate()+'T12:00:00'); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d.toISOString().slice(0,10); }
function memberByKey(key){ return state.members.find(m=>String(m.player_key||'').toLowerCase()===key.toLowerCase()); }
function memberByUser(uid){ return state.members.find(m=>m.user_id===uid); }
function progressByUser(uid){ return state.players.find(p=>p.user_id===uid); }
function questById(id){ return state.quests.find(q=>q.id===id); }
function canOwnQuest(q){
  if(!q) return false;
  if(q.owner_type==='individual') return q.assigned_user_id===ownUserId() || (!q.assigned_user_id && String(q.assignee_key||'').toLowerCase()===String(state.membership?.player_key||'').toLowerCase());
  return true;
}
function ownUserId(){ return state.session?.user?.id; }
function ownItems(){ return state.playerItems.filter(i=>i.owner_user_id===ownUserId()); }
function playerItemsVisible(uid){ return state.playerItems.filter(i=>i.owner_user_id===uid); }
function activeCampaign(){ return state.campaign; }
function safeMeta(v){ return v && typeof v==='object' ? v : {}; }

async function boot(){
  const {data:{session}} = await sb.auth.getSession();
  state.session=session;
  if(!session){ show(authView); return; }
  signOutBtn.classList.remove('hidden');
  sessionLabel.textContent=session.user.email || '';
  await loadIdentity();
}

async function loadIdentity(){
  const uid=state.session.user.id;
  const {data:member,error}=await sb.from('guild_members').select('guild_id,user_id,player_key,role').eq('user_id',uid).maybeSingle();
  if(error){ authMessage.textContent=error.message; show(authView); return; }
  if(!member){ renderGuildGate(); return; }
  state.membership=member;
  await loadGuild();
  const cycle = await sb.rpc('ensure_home_cycles');
  if(cycle.error) console.warn('Home cycle initialization:',cycle.error.message);
  await loadAll();
  state.characterUserId=uid;
  show(gameView); renderNav(); renderCampaignStrip(); render();
}

function renderGuildGate(){
  show(guildGate);
  guildGate.innerHTML=`<div class="panel auth-panel"><p class="eyebrow">GUILD INVITATION</p><h1>Claim your place in Questbound.</h1><p class="muted">Signing up alone reveals no Guild data. Choose your player slot and enter the private one-time invitation code.</p><form id="claimForm" class="stack"><label>Player<select id="playerSlot"><option>Kate</option><option>Drew</option></select></label><label>Invitation code<input id="inviteCode" autocomplete="off" required /></label><button type="submit">Join the Guild</button><button type="button" id="gateSignOut" class="ghost">Sign out</button></form><p id="claimMessage" class="status"></p></div>`;
  $('#gateSignOut').onclick=()=>sb.auth.signOut().then(()=>location.reload());
  $('#claimForm').onsubmit=async e=>{
    e.preventDefault(); const player=$('#playerSlot').value, code=$('#inviteCode').value.trim();
    $('#claimMessage').textContent='Checking invitation…';
    const {error}=await sb.rpc('claim_questbound_slot',{p_player_key:player,p_invite_code:code});
    if(error){ $('#claimMessage').textContent=error.message; return; }
    location.reload();
  };
}

async function loadGuild(){ const {data,error}=await sb.from('guilds').select('*').eq('id',state.membership.guild_id).single(); if(error) throw error; state.guild=data; }
async function loadAll(){
  const jobs=[loadMembers(),loadProfile(),loadCampaigns(),loadPlayers(),loadQuests(),loadCompletions(),loadActivity(),loadTreasury(),loadFate(),loadWeekly(),loadRoad(),loadGuildItems(),loadPlayerItems(),loadGauntlets(),loadTraining()];
  await Promise.all(jobs.map(p=>p.catch(e=>console.warn(e))));
  state.campaign=state.campaigns.find(c=>c.status==='active'||c.status==='victory') || null;
  await loadContributions().catch(e=>console.warn(e));
}
async function loadMembers(){ const {data,error}=await sb.from('guild_members').select('guild_id,user_id,player_key,role,joined_at').eq('guild_id',state.membership.guild_id); if(error) throw error; state.members=data||[]; }
async function loadProfile(){ const {data,error}=await sb.from('profiles').select('*').eq('user_id',ownUserId()).single(); if(error) throw error; state.profile=data; }
async function loadCampaigns(){ const {data,error}=await sb.from('campaigns').select('*').eq('guild_id',state.membership.guild_id).order('started_at',{ascending:false}); if(error) throw error; state.campaigns=data||[]; }
async function loadContributions(){ if(!state.campaign){state.contributions=[];return;} const {data,error}=await sb.from('campaign_contributions').select('*').eq('campaign_id',state.campaign.id); if(error) throw error; state.contributions=data||[]; }
async function loadPlayers(){ const {data,error}=await sb.from('player_progress_public').select('guild_id,user_id,personal_xp,level,rank_key,defense,ward,fortune,visible_stats,profiles(display_name,avatar_key)').eq('guild_id',state.membership.guild_id); if(error) throw error; state.players=data||[]; }
async function loadQuests(){ const {data,error}=await sb.from('quest_templates').select('id,key,title,objective,flavor,category,owner_type,assignee_key,assigned_user_id,value_tier,xp_personal,xp_campaign,random_eligible,gauntlet_eligible,random_rarity,visibility,recurrence,late_penalty,warning_days,notes,major_achievement').eq('guild_id',state.membership.guild_id).eq('active',true).order('category').order('title'); if(error) throw error; state.quests=data||[]; }
async function loadCompletions(){ const since=new Date(Date.now()-120*86400000).toISOString(); const {data,error}=await sb.from('quest_completions').select('id,quest_id,completed_by,subject_user_id,occurrence_key,source,completed_at,campaign_xp_awarded,modifiers,reversed_at').eq('guild_id',state.membership.guild_id).gte('completed_at',since).order('completed_at',{ascending:false}); if(error) throw error; state.completions=data||[]; }
async function loadActivity(){ const {data,error}=await sb.from('activity_events').select('*').eq('guild_id',state.membership.guild_id).order('created_at',{ascending:false}).limit(30); if(error) throw error; state.activity=data||[]; }
async function loadTreasury(){ const {data,error}=await sb.from('treasury_funds').select('*').eq('guild_id',state.membership.guild_id).eq('status','active').limit(1).maybeSingle(); if(error) throw error; state.treasury=data; }
async function loadFate(){ const {data,error}=await sb.from('fate_days').select('*').eq('guild_id',state.membership.guild_id).eq('fate_date',localDate()).maybeSingle(); if(error) throw error; state.fate=data; }
async function loadWeekly(){ const {data,error}=await sb.from('weekly_challenges').select('*').eq('guild_id',state.membership.guild_id).eq('week_key',weekKey()).maybeSingle(); if(error) throw error; state.weekly=data; }
async function loadRoad(){ const {data,error}=await sb.from('road_march_weeks').select('*').eq('guild_id',state.membership.guild_id).eq('week_key',weekKey()).maybeSingle(); if(error) throw error; state.road=data; const e=await sb.from('road_march_entries').select('*').eq('guild_id',state.membership.guild_id).eq('week_key',weekKey()).order('created_at',{ascending:false}); if(e.error) throw e.error; state.roadEntries=e.data||[]; }
async function loadGuildItems(){ const {data,error}=await sb.from('guild_items').select('*').eq('guild_id',state.membership.guild_id).order('created_at',{ascending:false}); if(error) throw error; state.guildItems=data||[]; }
async function loadPlayerItems(){ const {data,error}=await sb.from('player_items').select('*').eq('guild_id',state.membership.guild_id).order('acquired_at',{ascending:false}); if(error) throw error; state.playerItems=data||[]; }
async function loadGauntlets(){ const {data,error}=await sb.from('gauntlet_challenges').select('*').eq('guild_id',state.membership.guild_id).in('status',['active','pending']).order('created_at',{ascending:false}); if(error) throw error; state.gauntlets=data||[]; }
async function loadTraining(){ const {data,error}=await sb.from('training_assignments').select('*').eq('guild_id',state.membership.guild_id).eq('user_id',ownUserId()).order('assignment_date',{ascending:false}).limit(5); if(error) throw error; state.training=data||[]; }

function renderNav(){
  mainNav.innerHTML=navItems().map(n=>`<button data-tab="${esc(n)}" class="${state.tab===n?'active':''}">${esc(n)}</button>`).join('');
  mainNav.querySelectorAll('button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab; renderNav(); renderCampaignStrip(); render(); window.scrollTo({top:0,behavior:'smooth'});});
}
function renderCampaignStrip(){
  campaignStrip.classList.toggle('hidden',state.tab==='Home');
  const c=activeCampaign(); if(state.tab==='Home') return;
  if(!c){ campaignStrip.innerHTML='<div class="campaign-meta"><span>No active Campaign</span><span>Guild Admin can start one.</span></div>'; return; }
  const p=progressPct(c.campaign_xp,c.goal_xp), ch=chapterAt(p);
  campaignStrip.innerHTML=`<div class="campaign-meta"><strong>${esc(c.name)}</strong><span>${esc(ch.name)} · ${fmt(c.campaign_xp)} / ${fmt(c.goal_xp)} XP</span></div><div class="progress slim"><span style="width:${p}%"></span></div>`;
}
function render(){
  const t=state.tab;
  if(t==='Home') return renderHome();
  if(t==='Guild') return renderGuild();
  if(t==='Character') return renderCharacter();
  if(t===trainingLabel()) return renderTraining();
  if(t==='Quest Journal') return renderJournal();
  if(t==='Map') return renderMap();
  if(t==='Calendar') return renderCalendar();
  if(t==='Hall of History') return renderHall();
  if(t==='Guild Admin') return renderAdmin();
}

function chapterAt(pct){ return [...CHAPTERS].reverse().find(c=>pct>=c.pct) || CHAPTERS[0]; }
function campaignHome(){
  const c=activeCampaign();
  if(!c) return `<section class="card campaign-home"><p class="eyebrow">⚔ CURRENT CAMPAIGN</p><h2>No campaign is active.</h2></section>`;
  const pct=progressPct(c.campaign_xp,c.goal_xp), ch=chapterAt(pct), toNext=Math.max(0,Number(c.goal_xp)-Number(c.campaign_xp));
  const chapters=CHAPTERS.slice(1).map(x=>`<div class="chapter ${pct>=x.pct?'reached':''} ${pct+20<x.pct?'locked':''}"><b>${esc(x.name)}</b><span>${esc(x.sub)}</span></div>`).join('');
  return `<section class="card campaign-home">
    <div class="campaign-titleline"><div><p class="eyebrow">⚔ CURRENT CAMPAIGN</p><h2>${esc(c.name)}</h2><h3>${esc(ch.name)}</h3><p>${esc(ch.sub)}</p></div><strong>${fmt(c.campaign_xp)} / ${fmt(c.goal_xp)} XP</strong></div>
    <div class="progress campaign-progress"><span style="width:${pct}%"></span></div>
    <div class="chapter-grid">${chapters}</div>
    <div class="campaign-foot"><b>${Math.floor(pct)}% conquered</b><span>${toNext?`${fmt(toNext)} XP to The Burden Ends`:'The Hall awaits.'}</span></div>
  </section>`;
}

function playerStreak(uid){
  if(!uid) return 0;
  const set=new Set(state.completions.filter(c=>!c.reversed_at && (c.completed_by===uid || c.subject_user_id===uid)).map(c=>localDate(new Date(c.completed_at))));
  return streakFromSet(set);
}
function drewLockedData(){
  const drew=memberByKey('Drew'); if(!drew) return {streak:0,secured:false};
  const protein=state.quests.find(q=>q.key==='meet-protein-goal'), calories=state.quests.find(q=>q.key==='meet-calorie-goal');
  if(!protein||!calories) return {streak:0,secured:false};
  const p=new Set(), c=new Set();
  state.completions.filter(x=>!x.reversed_at && (x.subject_user_id===drew.user_id||x.completed_by===drew.user_id)).forEach(x=>{ const d=localDate(new Date(x.completed_at)); if(x.quest_id===protein.id)p.add(d); if(x.quest_id===calories.id)c.add(d); });
  const both=new Set([...p].filter(d=>c.has(d))); return {streak:streakFromSet(both),secured:both.has(localDate())};
}
function streakFromSet(set){
  const today=localDate(), yesterday=dateAdd(today,-1); let d=set.has(today)?today:yesterday; if(!set.has(d)) return 0; let n=0;
  while(set.has(d)){n++; d=dateAdd(d,-1);} return n;
}
function dateAdd(date,days){ const d=new Date(date+'T12:00:00'); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }

function playerCard(key){
  const member=memberByKey(key), uid=member?.user_id, p=uid?progressByUser(uid):null, joined=!!member;
  const sprite=key==='Kate'?'./assets/kate.svg':'./assets/drew.svg';
  const xp=Number(p?.personal_xp||0), level=p?.level||levelFor(xp), rank=rankFor(level), streak=uid?playerStreak(uid):0;
  const min=levelMinXp(level), next=nextLevelXp(level), within=xp-min, span=Math.max(1,next-min), pct=clamp(within/span*100,0,100);
  const items=uid?playerItemsVisible(uid):[]; const own=uid===ownUserId();
  const unclaimed=own?items.filter(i=>i.state==='unclaimed').length:0;
  const incoming=uid?state.gauntlets.filter(g=>g.target_user_id===uid).length:0;
  const contrib=uid?state.contributions.find(c=>c.user_id===uid)?.campaign_xp||0:0;
  return `<article class="player-card ${!joined?'unjoined':''}" style="--rank:${rank.color}">
    <div class="sprite-wrap"><img src="${sprite}" alt="${key} character sprite" /></div>
    <div class="player-main">
      <div class="player-name-row"><div><p class="eyebrow">${esc(rank.name)} · ${key==='Kate'?'RIDER':'WITCHER'}</p><h2>${esc(key)}</h2></div><span class="level-seal">LV ${level}</span></div>
      ${joined?`<div class="xp-total">${fmt(xp)} total XP <span>· ${fmt(contrib)} Campaign contribution</span></div><div class="progress player-xp"><span style="width:${pct}%"></span></div><div class="xp-next">${fmt(Math.max(0,next-xp))} XP to Level ${level+1}</div>`:`<div class="awaiting"><b>Awaiting Guild enrollment</b><span>This character wakes when ${key} claims the invitation.</span></div>`}
      <div class="player-badges"><span><b>${rank.ability}</b><small>Ability</small></span><span><b>${items.filter(i=>i.state==='equipped').length}</b><small>Loadout</small></span><span><b>${fmt(p?.defense||0)}</b><small>Defense</small></span><span><b>${streak}</b><small>Streak</small></span></div>
      <div class="player-alerts">${unclaimed?`<span class="alert gold">🎁 ${unclaimed} unclaimed loot</span>`:''}${incoming?`<span class="alert red">🥊 ${incoming} incoming Gauntlet</span>`:''}</div>
      ${joined?`<button class="text-link" data-character="${uid}">${own?'VIEW CHARACTER':'VIEW GUILD PROFILE'} →</button>`:''}
    </div>
  </article>`;
}

function streakCard(){
  const kate=memberByKey('Kate'), drew=memberByKey('Drew'), locked=drewLockedData();
  return `<section class="card home-card"><p class="eyebrow">🔥 STREAKS & LOCKED IN</p><h2>Keep the road warm.</h2><div class="streak-grid">
    <div><span>Kate's Questing Streak</span><b>${kate?playerStreak(kate.user_id):0}</b><small>days</small></div>
    <div><span>Drew · Locked In</span><b>${locked.streak}</b><small>${locked.secured?'Secured Today':'Protein + Calories'}</small></div>
  </div><p class="fine">Most missed days cost opportunity, not points. Locked In is secured automatically when Drew completes both daily goals.</p></section>`;
}
function vaultEffectsCard(){
  const items=state.guildItems, effects=items.filter(i=>safeMeta(i.metadata).effect||safeMeta(i.metadata).active_effect);
  return `<section class="card home-card"><div class="card-head"><div><p class="eyebrow">✦ PARTY EFFECTS · GUILD VAULT</p><h2>${effects.length?'Active blessings':'The Guild Vault is quiet.'}</h2></div><span class="count-pill">${items.reduce((a,i)=>a+Number(i.quantity||0),0)} shared</span></div>
    <div class="effect-list">${effects.slice(0,3).map(i=>`<div class="effect-row"><b>${esc(safeMeta(i.metadata).name||i.item_key)}</b><span>${esc(safeMeta(i.metadata).description||'Shared Guild effect')}</span></div>`).join('')||'<div class="empty-inline">Shared-use consumables and Party effects will appear here without exposing personal gear.</div>'}</div>
  </section>`;
}
function fateCard(){
  const s=safeMeta(state.fate?.state); return `<section class="card fate-card"><p class="eyebrow">🃏 TODAY'S FATE</p><h2>${esc(s.name||'The deck is still.')}</h2><div class="fate-text">${esc(s.text||'No Fate card has been dealt yet.')}</div><div class="fate-key">${state.fate?.fate_key?`Card: ${esc(state.fate.fate_key)}`:''}</div></section>`;
}
function recurrenceLabel(q){
  const r=safeMeta(q.recurrence), t=r.type||'once';
  if(t==='monthly_fixed') return `Due monthly · day ${r.day}`;
  if(t==='weekly') return `Weekly · ${(r.days||[]).join(', ')||'manual'}`;
  if(t==='interval') return `Every ${r.count||1} ${r.unit||'interval'}`;
  if(t==='frequency') return `${r.target||1}× per ${r.period||'period'}`;
  if(t==='seasonal') return `Seasonal · month ${r.month}`;
  if(t==='room_slots') return 'Rotating room objective';
  if(t==='repeatable') return 'Repeatable';
  return t==='once'?'One-time objective':t.replaceAll('_',' ');
}
function questWatchItems(){
  const m=Number(localDate().slice(5,7));
  const scored=state.quests.filter(q=>q.recurrence?.type!=='daily' && q.owner_type!=='personal_daily' && canOwnQuest(q)).map(q=>{
    const r=safeMeta(q.recurrence); let score=0;
    if(r.type==='monthly_fixed'){ const day=Number(localDate().slice(8,10)); score=100-Math.abs(Number(r.day||1)-day); }
    if(r.type==='weekly') score=75;
    if(r.type==='seasonal' && Number(r.month)===m) score=90;
    if(r.type==='frequency') score=60;
    if(q.assigned_user_id===ownUserId()||q.assignee_key===state.membership.player_key) score+=30;
    if(q.warning_days) score+=Number(q.warning_days)*2;
    return {q,score};
  }).filter(x=>x.score>0 && !isCompletedForCurrentOccurrence(x.q)).sort((a,b)=>b.score-a.score).slice(0,4).map(x=>x.q);
  return scored;
}
function questWatchCard(){
  const qs=questWatchItems();
  return `<section class="card home-card"><p class="eyebrow">⏳ QUEST WATCH</p><h2>Deadlines & rhythms</h2><div class="watch-list">${qs.map(q=>`<div class="watch-row"><div><b>${esc(q.title)}</b><span>${esc(recurrenceLabel(q))} · ${esc(ownerLabel(q))}</span></div><button data-jumpquest="${q.id}" class="mini ghost">Journal</button></div>`).join('')||'<div class="empty-inline">No urgent visible quests right now.</div>'}</div></section>`;
}

function seededHash(str){ let h=2166136261; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function randomBoard(){
  const key=`${state.guild?.id||''}:${localDate()}:${state.membership?.player_key||''}`;
  return state.quests.filter(q=>q.random_eligible && q.owner_type!=='personal_daily' && canOwnQuest(q) && !isCompletedForCurrentOccurrence(q)).map(q=>({q,n:seededHash(`${key}:${q.id}`)})).sort((a,b)=>a.n-b.n).slice(0,3).map(x=>x.q);
}
function randomCard(){
  const qs=randomBoard();
  return `<section class="card home-card random-card"><div class="card-head"><div><p class="eyebrow">★ TODAY'S DRAW</p><h2>Random Sidequests</h2></div><span class="count-pill">Featured +20%</span></div><div class="random-list">${qs.map(q=>questRow(q,{featured:true,compact:true})).join('')||'<div class="empty-inline">You cleared today’s visible draw. The road is quiet.</div>'}</div></section>`;
}
function weeklyRoadCard(){
  const w=state.weekly, wm=safeMeta(w?.metadata), r=state.road;
  const wp=w?progressPct(w.progress,w.target):0, rp=r?progressPct(r.total_steps,r.goal_steps):0;
  const kate=memberByKey('Kate'), drew=memberByKey('Drew');
  const stepsFor=uid=>state.roadEntries.filter(e=>e.user_id===uid).reduce((a,e)=>a+Number(e.steps||0),0);
  return `<section class="card home-card weekly-card"><div class="weekly-block"><p class="eyebrow">🛡 WEEKLY CHALLENGE</p><h2>${esc(w?.title||'The board is being prepared.')}</h2><p>${esc(wm.description||'A new challenge arrives each Monday.')}</p>${w?`<div class="progress"><span style="width:${wp}%"></span></div><div class="progress-meta"><b>${fmt(w.progress)} / ${fmt(w.target)} ${esc(w.unit)}</b><span>Completion bounty +${fmt(wm.reward_campaign_xp||0)} Campaign XP</span></div><button class="mini" id="weeklyLogBtn" ${w.completed_at?'disabled':''}>${w.completed_at?'✓ Challenge Complete':'＋ Log Progress'}</button>`:''}</div>
    <div class="road-block"><p class="eyebrow">🥾 WEEKLY ROAD MARCH</p><div class="road-head"><h2>${fmt(r?.total_steps||0)} / ${fmt(r?.goal_steps||100000)} steps</h2><span>Kate ${fmt(kate?stepsFor(kate.user_id):0)} · Drew ${fmt(drew?stepsFor(drew.user_id):0)}</span></div><div class="progress road"><span style="width:${rp}%"></span></div><div class="milestones">${[25,50,75,100].map(x=>`<span class="${rp>=x?'hit':''}">${x}%</span>`).join('')}</div><button class="mini" id="roadLogBtn">＋ Log Steps</button></div></section>`;
}
function treasuryCard(){
  const t=state.treasury; if(!t) return `<section class="card home-card treasury-card"><p class="eyebrow">💰 GUILD TREASURY</p><h2>No active savings goal</h2><div class="treasury-zero">0 Gold</div><p>Production intentionally begins blank. Create the first real fund in Guild Admin when you're ready.</p></section>`;
  const p=progressPct(t.balance,t.target_amount); return `<section class="card home-card treasury-card"><p class="eyebrow">💰 GUILD TREASURY</p><div class="card-head"><h2>${esc(t.name)}</h2><b>${money(t.balance)} / ${money(t.target_amount)} Gold</b></div><div class="progress"><span style="width:${p}%"></span></div><div class="milestones">${[25,50,75,100].map(x=>`<span class="${p>=x?'hit':''}">${x}%</span>`).join('')}</div><p class="fine">High-water mark: ${money(t.high_water)} Gold</p></section>`;
}
function activityCard(){ return `<section class="card home-card"><p class="eyebrow">LIVE FROM THE GUILD</p><h2>Recent Guild Activity</h2>${activityList(8)}</section>`; }
function activityList(limit=12){ const list=state.activity.slice(0,limit); return `<div class="activity">${list.map(a=>`<div class="activity-row"><div><b>${esc(a.message)}</b>${safeMeta(a.metadata).fate?`<span class="fate-used">🃏 ${esc(safeMeta(a.metadata).fate)}</span>`:''}</div><small>${new Date(a.created_at).toLocaleString()}${a.personal_xp?` · +${a.personal_xp} XP`:''}${a.campaign_xp?` · +${a.campaign_xp} Campaign`:''}</small></div>`).join('')||'<div class="empty-inline">No Guild activity yet.</div>'}</div>`; }

function renderHome(){
  screen.innerHTML=`<div class="home-mast"><div><p class="eyebrow">KATE & DREW'S SHARED CAMPAIGN</p><h1>Questbound</h1></div><div class="date-banner"><b>${esc(localPrettyDate())}</b><span>${esc(seasonName())} roads are open.</span></div></div>
    ${campaignHome()}
    <div class="players-grid">${playerCard('Kate')}${playerCard('Drew')}</div>
    <div class="home-two">${streakCard()}${vaultEffectsCard()}</div>
    <div class="home-two">${fateCard()}${questWatchCard()}</div>
    ${randomCard()}
    ${weeklyRoadCard()}
    <div class="home-two">${treasuryCard()}${activityCard()}</div>`;
  wireQuestButtons(); wireHomeButtons(); wireCharacterButtons();
}
function wireHomeButtons(){
  $('#weeklyLogBtn')?.addEventListener('click',logWeeklyProgress);
  $('#roadLogBtn')?.addEventListener('click',logRoadSteps);
  screen.querySelectorAll('[data-jumpquest]').forEach(b=>b.onclick=()=>{state.questFilter='All';state.tab='Quest Journal';renderNav();renderCampaignStrip();renderJournal();setTimeout(()=>document.querySelector(`[data-quest-id="${b.dataset.jumpquest}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),50);});
}
function wireCharacterButtons(){ screen.querySelectorAll('[data-character]').forEach(b=>b.onclick=()=>{state.characterUserId=b.dataset.character;state.tab='Character';renderNav();renderCampaignStrip();renderCharacter();window.scrollTo({top:0,behavior:'smooth'});}); }
async function logWeeklyProgress(){
  const amount=Number(prompt(`Add progress (${state.weekly?.unit||'units'}):`,'1')); if(!amount||amount<=0)return;
  const {error}=await sb.rpc('log_weekly_progress',{p_amount:amount}); if(error)return alert(error.message);
  await Promise.all([loadWeekly(),loadCampaigns(),loadActivity()]); state.campaign=state.campaigns.find(c=>c.status==='active'||c.status==='victory')||null; renderHome();
}
async function logRoadSteps(){
  const steps=Number(prompt('Add your Road March steps:','5000')); if(!steps||steps<=0)return;
  const {error}=await sb.rpc('log_road_steps',{p_steps:Math.floor(steps),p_source:'manual'}); if(error)return alert(error.message);
  await Promise.all([loadRoad(),loadActivity()]); renderHome();
}

function guildSharedSummary(){ return `<section class="card guild-banner"><p class="eyebrow">THE GUILD</p><h1>${esc(state.guild?.name||'Questbound')}</h1><p>Shared Campaign progress, Treasury, Vault, encounters, weekly systems, and Guild history live here. Private character state stays private.</p></section>`; }
function gauntletCard(){ const gs=state.gauntlets; return `<section class="card home-card"><p class="eyebrow">🥊 ACTIVE GAUNTLETS</p><h2>${gs.length?`${gs.length} encounter${gs.length===1?'':'s'} live`:'No challenge is on the board.'}</h2><div class="watch-list">${gs.map(g=>`<div class="watch-row"><div><b>${esc(g.objective||questById(g.quest_id)?.title||'Gauntlet')}</b><span>${fmt(g.reward_personal_xp)} Personal XP · ${g.reroll_used?'Reroll used':'One target reroll available'}</span></div><span class="status-chip">${esc(g.status)}</span></div>`).join('')||'<div class="empty-inline">Gauntlet encounters will appear here for both Guild members.</div>'}</div></section>`; }
function renderGuild(){
  screen.innerHTML=`${guildSharedSummary()}${campaignHome()}<div class="home-two">${treasuryCard()}${vaultEffectsCard()}</div><div class="home-two">${weeklyRoadCard()}${gauntletCard()}</div>${activityCard()}`;
  wireHomeButtons();
}

function selectedCharacter(){ const uid=state.characterUserId||ownUserId(); return {uid,member:memberByUser(uid),progress:progressByUser(uid)}; }
function renderCharacter(){
  const {uid,member,progress}=selectedCharacter(); const key=member?.player_key||'Adventurer', own=uid===ownUserId(), xp=Number(progress?.personal_xp||0), level=progress?.level||levelFor(xp), rank=rankFor(level), sprite=key==='Drew'?'./assets/drew.svg':'./assets/kate.svg';
  const items=playerItemsVisible(uid), equipped=items.filter(i=>i.state==='equipped'), pack=own?items.filter(i=>i.state!=='equipped'):[];
  screen.innerHTML=`<section class="character-hero" style="--rank:${rank.color}"><div class="character-art"><img src="${sprite}" alt="${esc(key)} sprite"></div><div><p class="eyebrow">${esc(rank.name)} · LEVEL ${level}</p><h1>${esc(key)}</h1><p>${fmt(xp)} Personal XP · Defense ${fmt(progress?.defense||0)} · Ward ${fmt(progress?.ward||0)} · Fortune ${fmt(progress?.fortune||0)}</p><div class="character-tabs"><span class="active">Overview</span><span>Loadout</span><span>Pack</span><span>Abilities</span><span>Specializations</span><span>Stats</span><span>Achievements</span><span>History</span></div></div></section>
  <div class="home-two"><section class="card home-card"><p class="eyebrow">⚔ LOADOUT</p><h2>${equipped.length?`${equipped.length} equipped`:'No gear equipped'}</h2>${equipped.map(i=>`<div class="effect-row"><b>${esc(i.item_key)}</b><span>${esc(i.equipped_slot||'Equipped')}</span></div>`).join('')||'<div class="empty-inline">Equipped gear will show its real passive here.</div>'}</section><section class="card home-card"><p class="eyebrow">✦ ABILITY</p><h2>${esc(rank.ability)}</h2><p>${abilityDescription(rank.key)}</p></section></div>
  ${own?`<section class="card home-card"><p class="eyebrow">🎒 PACK</p><h2>${pack.length} personal item${pack.length===1?'':'s'}</h2><p class="fine">Personal inventory is visible only to you. Your spouse can see equipped gear, not your private Pack.</p></section>`:''}`;
}
function abilityDescription(key){ return ({initiate:'Basic questing and Guild activity tracking unlocked.',cadet:'Once each week, choose one fitness quest for double base XP.',crawler:'Level-ups may reveal bonus challenge loot.',rider:'Choose a personal specialization that rewards how you actually play.',pathfinder:'Quiet days can prepare a Rested bonus.',witcher:'Elevate one dreaded task into a Witcher’s Contract.',champion:'Co-op completion can rally both adventurers.',wingleader:'Choose a category for featured favor.',grandmaster:'Upgrade one earlier ability.',commander:'Gain an extra active quest slot.',ascendant:'Rare Fate becomes more likely.',legend:'Endgame progression and legacy rewards.'})[key]||'Your road is still unfolding.'; }

function renderTraining(){
  const mine=state.training.find(t=>t.assignment_date===localDate()) || state.training[0];
  const title=trainingLabel();
  screen.innerHTML=`<section class="training-hero ${state.membership.player_key==='Drew'?'witcher':'rider'}"><p class="eyebrow">TRAINING PATH</p><h1>${esc(title)}</h1><p>${state.membership.player_key==='Drew'?'Trials of the Path · bodyweight and running first, with optional Gym Upgrades.':"12 Weeks to Threshing · strength, climbing, conditioning, mobility, and core power."}</p></section><div class="home-two"><section class="card home-card"><p class="eyebrow">TODAY'S ASSIGNMENT</p><h2>${esc(mine?.title||'No assignment drawn yet')}</h2><p>${esc(mine?.objective||'Training remains daily-accessible but never daily-required. The assignment engine is the next production system being ported from V24.10.')}</p>${mine?`<div class="quest-meta">+${mine.xp_personal} Personal XP · +${mine.xp_campaign} Campaign XP</div>`:''}</section><section class="card home-card"><p class="eyebrow">TRAINING PHILOSOPHY</p><h2>1–2 substantive sessions is enough.</h2><p>No penalty for a quieter week. Mobility, recovery, runs, conditioning, and major trials can all earn their place on the Path.</p></section></div>`;
}

function ownerLabel(q){ if(q.owner_type==='personal_daily')return'Personal Daily'; if(q.owner_type==='co-op')return'Co-op'; if(q.owner_type==='shared')return'Shared'; return q.assignee_key||'Individual'; }
function isCompletedForCurrentOccurrence(q){ const occ=occurrenceKey(q); return state.completions.some(c=>!c.reversed_at && c.quest_id===q.id && c.occurrence_key===occ && (q.owner_type!=='personal_daily' || c.subject_user_id===ownUserId())); }
function questRow(q,{featured=false,compact=false}={}){
  const completed=isCompletedForCurrentOccurrence(q), eligible=canOwnQuest(q); const personal=featured?Math.round(Number(q.xp_personal||0)*1.2):Number(q.xp_personal||0);
  return `<div class="quest ${compact?'compact':''} ${completed?'done':''}" data-quest-id="${q.id}"><div><div class="quest-title">${completed?'✓ ':''}${esc(q.title)}</div><div class="quest-chips"><span>${esc(q.category)}</span><span>${esc(ownerLabel(q))}</span>${featured?'<span class="featured">★ +20% FEATURED BONUS</span>':''}</div><div class="quest-meta">+${fmt(personal)} personal · +${fmt(q.xp_campaign)} campaign${q.major_achievement?' · Major Achievement':''}</div></div><div class="quest-actions"><button data-complete="${q.id}" data-source="${featured?'featured':'journal'}" ${completed||!eligible?'disabled':''}>${completed?'Done':eligible?'Complete':'Assigned to spouse'}</button></div></div>`;
}
function renderJournal(){
  const cats=['All',...new Set(state.quests.map(q=>q.category))]; const qs=state.questFilter==='All'?state.quests:state.quests.filter(q=>q.category===state.questFilter);
  screen.innerHTML=`<section class="ledger-head"><p class="eyebrow">THE GUILD LEDGER</p><h1>Quest Journal</h1><p>${fmt(state.quests.length)} active visible quests. Hidden surprise and secret subplot pools remain server-side.</p></section>${questWatchCard()}<div class="filterbar">${cats.map(c=>`<button class="${state.questFilter===c?'active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="quest-list journal-list">${qs.map(q=>questRow(q)).join('')}</div>`;
  screen.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.questFilter=b.dataset.filter;renderJournal();}); wireQuestButtons(); wireHomeButtons();
}
function wireQuestButtons(){ screen.querySelectorAll('[data-complete]').forEach(b=>b.onclick=()=>completeQuest(b.dataset.complete,b,b.dataset.source||'journal')); }
async function completeQuest(id,button,source='journal'){
  button.disabled=true; const q=state.quests.find(x=>x.id===id); const occurrence=occurrenceKey(q);
  const {data,error}=await sb.rpc('complete_quest',{p_quest_id:id,p_occurrence_key:occurrence,p_source:source});
  if(error){ alert(error.message); button.disabled=false; return; }
  const fate=data?.fate?`\nFate: ${data.fate}`:'';
  if(data) showToast(`✓ ${q.title} · +${data.personal_xp_each} XP · +${data.campaign_xp} Campaign${fate}`);
  await Promise.all([loadPlayers(),loadCampaigns(),loadContributions(),loadCompletions(),loadActivity(),loadWeekly()]); state.campaign=state.campaigns.find(c=>c.status==='active'||c.status==='victory')||null; renderCampaignStrip(); render();
}
function occurrenceKey(q){
  const date=localDate(), r=safeMeta(q?.recurrence), type=r.type||'once';
  if(type==='once')return'once'; if(type==='daily')return date; if(type==='weekly')return`week:${weekKey()}`; if(type==='monthly_fixed'||type==='interval'||type==='frequency')return`${type}:${date.slice(0,7)}`; if(type==='seasonal'||type==='seasonal_wildcard')return`${type}:${date.slice(0,4)}`; return`${type}:${date}`;
}
function showToast(text){ let n=document.querySelector('.toast'); if(!n){n=document.createElement('div');n.className='toast';document.body.appendChild(n);} n.textContent=text;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),3600); }

function renderMap(){ screen.innerHTML=`<section class="ledger-head"><p class="eyebrow">🗺 PARTY MAP</p><h1>The Guild's Known Territory</h1><p>Fog, Renown, expeditions and reveal history already have production tables. The V24 map presentation is next in the visual parity queue.</p></section><section class="card map-board"><div class="map-placeholder">⌖<b>Home Territory</b><span>No exact home address is stored or exposed.</span></div></section>`; }
function scheduledQuests(){ return state.quests.filter(q=>!['once','repeatable','daily','seasonal_wildcard'].includes(q.recurrence?.type)); }
function renderCalendar(){ const qs=scheduledQuests(); screen.innerHTML=`<section class="ledger-head"><p class="eyebrow">📅 GUILD CALENDAR</p><h1>The Road Ahead</h1><p>Recurring obligations live here; seasonal opportunities stay in the Random pool rather than being pinned to fake dates.</p></section><div class="quest-list journal-list">${qs.map(q=>`<div class="quest"><div><div class="quest-title">${esc(q.title)}</div><div class="quest-meta">${esc(recurrenceLabel(q))} · ${esc(ownerLabel(q))}</div></div></div>`).join('')||'<div class="empty-inline">No scheduled quests visible.</div>'}</div>`; }
function renderHall(){ const archived=state.campaigns.filter(c=>c.status==='archived'||c.archived_at); screen.innerHTML=`<section class="hall-hero"><p class="eyebrow">🏛 HALL OF HISTORY</p><h1>The Guild's Trophy Shelf</h1><p>Campaign trophies and major achievements remain after Campaign XP resets.</p></section><div class="trophy-shelf">${archived.map(c=>`<div class="trophy"><span>🏆</span><b>Victory: ${esc(c.name)}</b><small>${c.archived_at?new Date(c.archived_at).toLocaleDateString():''}</small></div>`).join('')||'<div class="trophy locked"><span>🏆</span><b>Your first Campaign victory waits here.</b></div>'}</div>`; }
function renderAdmin(){ screen.innerHTML=`<section class="ledger-head"><p class="eyebrow">⚙ GUILD ADMINISTRATION</p><h1>Behind the Screen</h1><p>Configuration stays plain here so the adventure-facing tabs remain immersive.</p></section><div class="home-two"><section class="card home-card"><p class="eyebrow">PRIVACY STATUS</p><h2 class="good">Private-by-default is active.</h2><p>Private player state is self-only. Personal inventory is owner-only except equipped gear. Hidden surprise content is not shipped in the public client.</p></section><section class="card home-card"><p class="eyebrow">LAUNCH DATA</p><h2>${fmt(state.quests.length)} visible active quests</h2><p>${state.treasury?'Treasury fund active.':'Guild Treasury remains at its clean $0 launch state.'}</p></section></div><section class="card home-card"><p class="eyebrow">PLAYTEST RESET</p><h2>Reset tooling is reserved for the end of beta.</h2><p>Accounts, Guild membership, quest definitions and privacy configuration will be preserved while disposable gameplay state is cleared.</p></section>`; }

let authMode='signin';
authForm.insertAdjacentHTML('beforeend','<button type="button" id="toggleAuth" class="ghost">Need an account? Create one</button>');
$('#toggleAuth').onclick=()=>{authMode=authMode==='signin'?'signup':'signin';$('#toggleAuth').textContent=authMode==='signin'?'Need an account? Create one':'Already have an account? Sign in';authForm.querySelector('button[type=submit]').textContent=authMode==='signin'?'Sign in':'Create account';};
authForm.onsubmit=async e=>{
  e.preventDefault(); authMessage.textContent=''; const email=$('#email').value.trim(),password=$('#password').value;
  const result=authMode==='signin'
    ? await sb.auth.signInWithPassword({email,password})
    : await sb.auth.signUp({email,password,options:{emailRedirectTo:APP_URL}});
  if(result.error){authMessage.textContent=result.error.message;return;}
  if(authMode==='signup'&&!result.data.session){authMessage.textContent='Account created. Check your email, confirm it once, then return here and sign in.';return;}
  location.reload();
};
signOutBtn.onclick=async()=>{await sb.auth.signOut();location.reload();};
sb.auth.onAuthStateChange((_event,session)=>{if(!session&&state.session)location.reload();});

boot();