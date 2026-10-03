const SUPABASE_URL = 'https://zzvqruhfgjocnwffavcb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-nq-Po_ytT0E6uM8vmp1zw_FPftRDVN';
const APP_URL = 'https://katemelynnharris-prog.github.io/questbound/';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s) => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt = n => Number(n || 0).toLocaleString();
const state = { session:null, membership:null, guild:null, profile:null, campaign:null, players:[], quests:[], activity:[], treasury:null, tab:'Home', questFilter:'All' };

const authView=$('#authView'), guildGate=$('#guildGate'), gameView=$('#gameView');
const authForm=$('#authForm'), authMessage=$('#authMessage'), signOutBtn=$('#signOutBtn');
const screen=$('#screen'), mainNav=$('#mainNav'), campaignStrip=$('#campaignStrip'), sessionLabel=$('#sessionLabel');

function show(which){ authView.classList.add('hidden'); guildGate.classList.add('hidden'); gameView.classList.add('hidden'); which.classList.remove('hidden'); }
function trainingLabel(){ return state.membership?.player_key === 'Drew' ? 'Witcher Trials' : "Rider's Quadrant"; }
function navItems(){ return ['Home','Guild','Character',trainingLabel(),'Quest Journal','Map','Calendar','Hall of History','Guild Admin']; }
function progressPct(x,g){ return Math.max(0,Math.min(100,g?x/g*100:0)); }

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
  await Promise.all([loadGuild(),loadProfile(),loadCampaign(),loadPlayers(),loadQuests(),loadActivity(),loadTreasury()]);
  show(gameView); renderNav(); renderCampaignStrip(); render();
}

function renderGuildGate(){
  show(guildGate);
  guildGate.innerHTML=`<div class="panel auth-panel"><p class="eyebrow">GUILD INVITATION</p><h1>Claim your place in Questbound.</h1><p class="muted">Signing up alone reveals no Guild data. Choose your player slot and enter the private one-time invitation code.</p><form id="claimForm" class="stack"><label>Player<select id="playerSlot"><option>Kate</option><option>Drew</option></select></label><label>Invitation code<input id="inviteCode" autocomplete="off" required /></label><button type="submit">Join the Guild</button><button type="button" id="gateSignOut" class="ghost">Sign out</button></form><p id="claimMessage" class="status"></p></div>`;
  $('#gateSignOut').onclick=()=>sb.auth.signOut().then(()=>location.reload());
  $('#claimForm').onsubmit=async e=>{
    e.preventDefault();
    const player=$('#playerSlot').value, code=$('#inviteCode').value.trim();
    $('#claimMessage').textContent='Checking invitation…';
    const {error}=await sb.rpc('claim_questbound_slot',{p_player_key:player,p_invite_code:code});
    if(error){ $('#claimMessage').textContent=error.message; return; }
    location.reload();
  };
}

async function loadGuild(){ const {data}=await sb.from('guilds').select('*').eq('id',state.membership.guild_id).single(); state.guild=data; }
async function loadProfile(){ const {data}=await sb.from('profiles').select('*').eq('user_id',state.session.user.id).single(); state.profile=data; }
async function loadCampaign(){ const {data}=await sb.from('campaigns').select('*').eq('guild_id',state.membership.guild_id).eq('status','active').order('started_at',{ascending:false}).limit(1).maybeSingle(); state.campaign=data; }
async function loadPlayers(){ const {data}=await sb.from('player_progress_public').select('guild_id,user_id,personal_xp,level,rank_key,defense,ward,fortune,visible_stats,profiles(display_name,avatar_key)').eq('guild_id',state.membership.guild_id); state.players=data||[]; }
async function loadQuests(){ const {data}=await sb.from('quest_templates').select('id,key,title,category,owner_type,assignee_key,assigned_user_id,value_tier,xp_personal,xp_campaign,random_eligible,gauntlet_eligible,recurrence,notes,major_achievement').eq('guild_id',state.membership.guild_id).eq('active',true).order('category').order('title'); state.quests=data||[]; }
async function loadActivity(){ const {data}=await sb.from('activity_events').select('*').eq('guild_id',state.membership.guild_id).order('created_at',{ascending:false}).limit(12); state.activity=data||[]; }
async function loadTreasury(){ const {data}=await sb.from('treasury_funds').select('*').eq('guild_id',state.membership.guild_id).eq('status','active').limit(1).maybeSingle(); state.treasury=data; }

function renderNav(){ mainNav.innerHTML=navItems().map(n=>`<button data-tab="${esc(n)}" class="${state.tab===n?'active':''}">${esc(n)}</button>`).join(''); mainNav.querySelectorAll('button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;renderNav();render();}); }
function renderCampaignStrip(){ const c=state.campaign; if(!c){campaignStrip.innerHTML='<div class="campaign-meta"><span>No active Campaign</span><span>Guild Admin can start one.</span></div>';return;} const p=progressPct(c.campaign_xp,c.goal_xp); campaignStrip.innerHTML=`<div class="campaign-meta"><strong>${esc(c.name)}</strong><span>${fmt(c.campaign_xp)} / ${fmt(c.goal_xp)} Campaign XP</span></div><div class="progress"><span style="width:${p}%"></span></div>`; }
function render(){ const t=state.tab; if(t==='Home')return renderHome(); if(t==='Guild')return renderGuild(); if(t==='Character')return renderCharacter(); if(t===trainingLabel())return renderTraining(); if(t==='Quest Journal')return renderJournal(); if(t==='Map')return renderMap(); if(t==='Calendar')return renderCalendar(); if(t==='Hall of History')return renderHall(); if(t==='Guild Admin')return renderAdmin(); }

function playerCard(p){ const name=p.profiles?.display_name||'Adventurer'; const me=p.user_id===state.session.user.id; return `<article class="card"><p class="eyebrow">${me?'YOU':'GUILD MEMBER'}</p><h2>${esc(name)}</h2><div class="big-number">Level ${fmt(p.level)}</div><p>${fmt(p.personal_xp)} total XP · ${esc(p.rank_key)}</p><div class="stat-row"><span class="chip">Defense ${fmt(p.defense)}</span><span class="chip">Ward ${fmt(p.ward)}</span><span class="chip">Fortune ${fmt(p.fortune)}</span></div></article>`; }
function renderHome(){ const c=state.campaign; const random=state.quests.filter(q=>q.random_eligible).slice(0,4); screen.innerHTML=`<section class="hero"><p class="eyebrow">THE GUILD ROAD</p><h1>${esc(c?.name||'Questbound')}</h1><p class="muted">Real life is the campaign. The app keeps score, reveals opportunities, and protects the parts meant to remain private.</p></section><div class="grid">${state.players.map(playerCard).join('')||'<div class="card full empty">Player progression appears after Guild enrollment.</div>'}<section class="card full"><p class="kicker">Random Sidequests</p><h2>Quest Watch</h2><div class="quest-list">${random.map(questRow).join('')||'<div class="empty">No eligible sidequests visible right now.</div>'}</div></section><section class="card"><p class="kicker">Guild Treasury</p>${treasurySummary()}</section><section class="card"><p class="kicker">Recent Activity</p>${activityList(5)}</section></div>`; wireQuestButtons(); }
function treasurySummary(){ const t=state.treasury; return t?`<h2>${esc(t.name)}</h2><div class="big-number">$${Number(t.balance).toFixed(2)}</div><p class="muted">Goal $${Number(t.target_amount).toFixed(2)}</p>`:`<h2>No active fund</h2><p class="muted">This is intentional. Production begins at $0 with no imported prototype balance.</p>`; }
function activityList(limit=12){ const list=state.activity.slice(0,limit); return `<div class="activity">${list.map(a=>`<div class="activity-row"><div>${esc(a.message)}</div><small>${new Date(a.created_at).toLocaleString()}${a.personal_xp?` · +${a.personal_xp} XP`:''}${a.campaign_xp?` · +${a.campaign_xp} Campaign`:''}</small></div>`).join('')||'<div class="empty">No production activity yet.</div>'}</div>`; }
function renderGuild(){ screen.innerHTML=`<section class="hero"><p class="eyebrow">GUILD</p><h1>${esc(state.guild?.name||'Questbound')}</h1><p class="muted">Shared systems live here. Private player state does not.</p></section><div class="grid"><section class="card">${treasurySummary()}</section><section class="card"><p class="kicker">Guild Vault</p><h2>Shared-use items</h2><p class="muted">The production inventory tables are live; item seeding comes in the next content pass.</p></section><section class="card full"><p class="kicker">Activity Log</p>${activityList()}</section></div>`; }
function renderCharacter(){ const p=state.players.find(x=>x.user_id===state.session.user.id); screen.innerHTML=`<section class="hero"><p class="eyebrow">CHARACTER</p><h1>${esc(state.profile?.display_name||'Adventurer')}</h1><p class="muted">Private state is isolated from spouse-readable character summary fields.</p></section><div class="grid">${p?playerCard(p):'<div class="card empty">Character progression initializes after enrollment.</div>'}<section class="card"><h2>Loadout</h2><p class="muted">Equipment wiring is next; only equipped gear will be spouse-visible.</p></section><section class="card"><h2>Pack</h2><p class="muted">Personal inventory remains owner-only by RLS.</p></section></div>`; }
function renderTraining(){ screen.innerHTML=`<section class="hero"><p class="eyebrow">TRAINING</p><h1>${esc(trainingLabel())}</h1><p class="muted">Daily-accessible, not daily-required. The production schema already separates assignments and physical stat progression per authenticated player.</p></section><div class="grid"><section class="card full"><h2>Assignment system ready for content migration</h2><p>Drew: bodyweight + running first, optional Gym Upgrade. Kate: Rider's Quadrant progression. Completion will update physical stats atomically.</p></section></div>`; }
function ownerLabel(q){ if(q.owner_type==='personal_daily')return'Personal Daily'; if(q.owner_type==='co-op')return'Co-op'; if(q.owner_type==='shared')return'Shared'; return q.assignee_key||'Individual'; }
function questRow(q){ return `<div class="quest"><div><div class="quest-title">${esc(q.title)}</div><div class="quest-meta">${esc(q.category)} · ${esc(ownerLabel(q))} · ${esc(q.value_tier)} · +${fmt(q.xp_personal)} XP / +${fmt(q.xp_campaign)} Campaign${q.major_achievement?' · Major Achievement':''}</div></div><div class="quest-actions"><button data-complete="${q.id}">Complete</button></div></div>`; }
function renderJournal(){ const cats=['All',...new Set(state.quests.map(q=>q.category))]; const qs=state.questFilter==='All'?state.quests:state.quests.filter(q=>q.category===state.questFilter); screen.innerHTML=`<section class="hero"><p class="eyebrow">QUEST JOURNAL</p><h1>${fmt(state.quests.length)} active quests</h1><p class="muted">This is the visible master library. Hidden surprise and secret subplot pools are intentionally not downloadable from the client.</p></section><div class="filterbar">${cats.map(c=>`<button class="${state.questFilter===c?'active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="quest-list">${qs.map(questRow).join('')}</div>`; screen.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.questFilter=b.dataset.filter;renderJournal();}); wireQuestButtons(); }
function wireQuestButtons(){ screen.querySelectorAll('[data-complete]').forEach(b=>b.onclick=()=>completeQuest(b.dataset.complete,b)); }
async function completeQuest(id,button){ button.disabled=true; const q=state.quests.find(x=>x.id===id); const occurrence=occurrenceKey(q); const {error}=await sb.rpc('complete_quest',{p_quest_id:id,p_occurrence_key:occurrence,p_source:'journal'}); if(error){alert(error.message);button.disabled=false;return;} await Promise.all([loadPlayers(),loadCampaign(),loadActivity()]);renderCampaignStrip();render(); }
function occurrenceKey(q){ const now=new Date(),date=now.toISOString().slice(0,10),type=q?.recurrence?.type||'once'; if(type==='once')return'once'; if(type==='daily')return date; if(type==='weekly'){const d=new Date(now),day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);return`week:${d.toISOString().slice(0,10)}`;} return`${type}:${date}`; }
function renderMap(){ screen.innerHTML=`<section class="hero"><p class="eyebrow">MAP</p><h1>Home Territory</h1><p class="muted">Fog, Renown, expeditions and reveal history are database-backed. Geographic styling comes after the auth beta.</p></section>`; }
function renderCalendar(){ const scheduled=state.quests.filter(q=>['daily','weekly','monthly_fixed','monthly_dates'].includes(q.recurrence?.type)); screen.innerHTML=`<section class="hero"><p class="eyebrow">CALENDAR</p><h1>Rhythms & Deadlines</h1><p class="muted">Seasonal surprise quests are intentionally not pinned to fake dates.</p></section><div class="quest-list">${scheduled.map(questRow).join('')||'<div class="empty">No scheduled quests visible.</div>'}</div>`;wireQuestButtons(); }
function renderHall(){ screen.innerHTML=`<section class="hero"><p class="eyebrow">HALL OF HISTORY</p><h1>Nothing is forgotten.</h1><p class="muted">Campaign archives, milestones and achievements will populate here as production play begins.</p></section>`; }
function renderAdmin(){ screen.innerHTML=`<section class="hero"><p class="eyebrow">GUILD ADMIN</p><h1>Configuration</h1><p class="muted">Plain language is intentional here. Admin tools will manage quests, Random/Gauntlet eligibility, Treasury correction, Campaign setup and system testing.</p></section><div class="grid"><section class="card"><h2>Privacy status</h2><p class="good">Private-by-default schema active.</p><p>Hidden surprise pool is stored outside the exposed public API schema. Private player state is self-only.</p></section><section class="card"><h2>Launch data</h2><p>${fmt(state.quests.length)} visible active quests loaded for this account.</p><p>Guild Treasury starts blank.</p></section></div>`; }

let authMode='signin';
authForm.insertAdjacentHTML('beforeend','<button type="button" id="toggleAuth" class="ghost">Need an account? Create one</button>');
$('#toggleAuth').onclick=()=>{authMode=authMode==='signin'?'signup':'signin';$('#toggleAuth').textContent=authMode==='signin'?'Need an account? Create one':'Already have an account? Sign in';authForm.querySelector('button[type=submit]').textContent=authMode==='signin'?'Sign in':'Create account';};
authForm.onsubmit=async e=>{e.preventDefault();authMessage.textContent='';const email=$('#email').value.trim(),password=$('#password').value;const result=authMode==='signin'?await sb.auth.signInWithPassword({email,password}):await sb.auth.signUp({email,password,options:{emailRedirectTo:APP_URL}});if(result.error){authMessage.textContent=result.error.message;return;}if(authMode==='signup'&&!result.data.session){authMessage.textContent='Account created. Check your email, then return to Questbound and sign in.';return;}location.reload();};
signOutBtn.onclick=async()=>{await sb.auth.signOut();location.reload();};
sb.auth.onAuthStateChange((_event,session)=>{if(!session&&state.session)location.reload();});
boot();