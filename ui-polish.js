const QB_URL='https://zzvqruhfgjocnwffavcb.supabase.co';
const QB_KEY='sb_publishable_-nq-Po_ytT0E6uM8vmp1zw_FPftRDVN';
const qb=window.supabase.createClient(QB_URL,QB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const screen=document.querySelector('#screen');

const SPEC_DEFS={
  Archivist:{desc:'Knowledge, reading, study, and writing.',abilities:['Deep Study','Research Expedition']},
  Vanguard:{desc:'Training, resilience, and physical trials.',abilities:['Second Wind','Battle Rhythm']},
  Pathfinder:{desc:'Exploration, Renown, and discovery.',abilities:['Cartographer','Farther Roads']},
  Steward:{desc:'Home, finance, and keeping the Guild strong.',abilities:['Good Order','Guild Provisioner']}
};
const RANKS=[
  [1,4,'Initiate','The Ledger'],[5,9,'Cadet','Second Wind'],[10,14,'Crawler','Loot Find'],[15,19,'Rider','Signet'],[20,24,'Pathfinder','Rested'],[25,29,'Witcher',"Witcher's Contract"],[30,39,'Champion','Rally'],[40,49,'Wingleader',"Commander's Favor"],[50,59,'Grandmaster','Masterwork'],[60,74,'Commander','War Council'],[75,99,'Ascendant','Legendary Draw'],[100,9999,'Legend','Prestige']
];
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString();
const money=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
const meta=v=>v&&typeof v==='object'?v:{};
const activeTab=()=>document.querySelector('#mainNav button.active')?.textContent?.trim()||'';
const clickActive=()=>setTimeout(()=>document.querySelector('#mainNav button.active')?.click(),40);
const rankFor=l=>RANKS.find(r=>l>=r[0]&&l<=r[1])||RANKS.at(-1);

function removeRedundantQuestboundTitles(){
  screen?.querySelectorAll('h1,h2').forEach(h=>{if(h.textContent.trim().toLowerCase()==='questbound')h.remove()});
}

async function identity(){
  const {data:{session}}=await qb.auth.getSession();
  if(!session)return null;
  const {data:membership}=await qb.from('guild_members').select('guild_id,user_id,player_key,role').eq('user_id',session.user.id).maybeSingle();
  return membership?{session,membership}:null;
}

function itemName(i){return meta(i?.metadata).name||String(i?.item_key||'').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function slotName(raw){
  const s=String(raw||'').toLowerCase();
  return ({head:'Helm',helm:'Helm',helmet:'Helm',chest:'Chest',body:'Chest',hands:'Gauntlets',gauntlets:'Gauntlets',weapon:'Weapon I',main_hand:'Weapon I','main-hand':'Weapon I',offhand:'Weapon II',off_hand:'Weapon II','off-hand':'Weapon II',legs:'Leggings',leggings:'Leggings',feet:'Boots',boots:'Boots',charm:'Relic I',relic:'Relic I',relic1:'Relic I',relic2:'Relic II'}[s]||raw);
}

async function renderCharacterDashboard(forcedKey=null){
  if(activeTab()!=='Character'||!screen)return;
  const id=await identity();if(!id)return;
  let selected=forcedKey||screen.querySelector('.character-hero h1')?.textContent?.trim()||id.membership.player_key;
  if(!['Kate','Drew'].includes(selected))selected=id.membership.player_key;
  const {data:members=[]}=await qb.from('guild_members').select('guild_id,user_id,player_key,role').eq('guild_id',id.membership.guild_id);
  const target=members.find(m=>m.player_key===selected)||id.membership;
  const own=target.user_id===id.session.user.id;
  const [pRes,cRes,iRes,tRes,sRes,aRes,eRes]=await Promise.all([
    qb.from('player_progress_public').select('*').eq('guild_id',id.membership.guild_id).eq('user_id',target.user_id).maybeSingle(),
    qb.from('campaigns').select('id,status').eq('guild_id',id.membership.guild_id).in('status',['active','victory']).limit(1).maybeSingle(),
    qb.from('player_items').select('*').eq('guild_id',id.membership.guild_id).eq('owner_user_id',target.user_id).order('acquired_at',{ascending:false}),
    qb.from('training_stats').select('*').eq('guild_id',id.membership.guild_id).eq('user_id',target.user_id).maybeSingle(),
    own?qb.from('player_specializations').select('*').eq('guild_id',id.membership.guild_id).eq('user_id',target.user_id):Promise.resolve({data:[]}),
    qb.from('activity_events').select('*').eq('guild_id',id.membership.guild_id).order('created_at',{ascending:false}).limit(20),
    qb.from('exploration_state').select('*').eq('guild_id',id.membership.guild_id).maybeSingle()
  ]);
  const progress=pRes.data||{}, items=iRes.data||[], training=tRes.data||{}, specs=sRes.data||[], activity=(aRes.data||[]).filter(x=>x.actor_user_id===target.user_id||x.target_user_id===target.user_id).slice(0,8), exploration=eRes.data||{};
  let contribution=0;if(cRes.data?.id){const r=await qb.from('campaign_contributions').select('campaign_xp').eq('campaign_id',cRes.data.id).eq('user_id',target.user_id).maybeSingle();contribution=Number(r.data?.campaign_xp||0)}
  const xp=Number(progress.personal_xp||0),level=Number(progress.level||1),rank=rankFor(level),sprite=window.QB_SPRITES?.[selected]||'';
  const equipped=items.filter(i=>i.state==='equipped'),pack=own?items.filter(i=>i.state!=='equipped'):[];
  const slots=['Helm','Chest','Gauntlets','Weapon I','Weapon II','Leggings','Relic I','Boots','Relic II'];
  const slotItem=s=>equipped.find(i=>slotName(i.equipped_slot)===s);
  const earned=1+Math.floor(level/10),spent=specs.reduce((n,s)=>n+Number(s.rank||0),0),points=Math.max(0,earned-spent),activeSpecs=specs.filter(s=>Number(s.rank)>0).length;
  const specAbilities=specs.flatMap(s=>(SPEC_DEFS[s.specialization_key]?.abilities||[]).slice(0,Number(s.rank||0)).map(a=>`${a} · ${s.specialization_key}`));
  const achievements=[xp>0&&'First Quest',Number(training.training_sessions||0)>0&&'Training Begun',Number(exploration.renown||0)>0&&'Beyond the Keep',level>=5&&'Cadet Rank'].filter(Boolean);
  const hist=activity.map(a=>`<div class="qb-history-row"><b>${esc(a.message||a.event_type)}</b><span>${new Date(a.created_at).toLocaleDateString()}</span></div>`).join('')||'<div class="empty-inline">No personal history yet.</div>';
  const specHtml=own?Object.entries(SPEC_DEFS).map(([name,d])=>{const r=Number(specs.find(s=>s.specialization_key===name)?.rank||0),blocked=points<=0||r>=5||(r===0&&activeSpecs>=3);return `<div class="qb-spec-row"><div><b>${esc(name)} · ${r?'Rank '+r:'Unlearned'}</b><span>${esc(d.desc)}</span></div><button data-qb-spec="${esc(name)}" ${blocked?'disabled':''}>${r?'Deepen':'Learn'}</button></div>`}).join(''):'<div class="empty-inline">Specializations are private to their player.</div>';
  screen.dataset.qbPolished=`character:${selected}`;
  screen.innerHTML=`
    <section class="qb-character-hero">
      <div class="qb-character-art"><img src="${sprite}" alt="${esc(selected)} sprite"></div>
      <div class="qb-character-summary"><div class="qb-character-switch">${members.map(m=>`<button data-qb-char="${esc(m.player_key)}" class="${m.player_key===selected?'active':''}">${esc(m.player_key)}</button>`).join('')}</div><p class="eyebrow">${esc(rank[2])} · LEVEL ${level}</p><h1>${esc(selected)}</h1><p>${fmt(xp)} Personal XP · ${fmt(contribution)} Campaign contribution</p><div class="qb-stat-strip"><span><b>${fmt(progress.defense||0)}</b><small>Defense</small></span><span><b>${fmt(progress.ward||0)}</b><small>Ward</small></span><span><b>${fmt(progress.fortune||0)}</b><small>Fortune</small></span><span><b>${fmt(training.training_sessions||0)}</b><small>Training</small></span><span><b>${fmt(exploration.renown||0)}</b><small>Renown</small></span></div></div>
    </section>
    <div class="qb-character-grid">
      <section class="card qb-panel qb-loadout"><div class="card-head"><div><p class="eyebrow">⚔ LOADOUT</p><h2>Equipped Gear</h2></div><span class="count-pill">${equipped.length} / 9</span></div><div class="gear-grid">${slots.map(s=>{const i=slotItem(s);return `<div class="gear-slot ${i?'filled':'empty-slot'}"><small>${esc(s)}</small><b>${i?esc(itemName(i)):'Empty'}</b>${i?`<em>${esc(meta(i.metadata).rarity||'equipped')}</em>`:''}</div>`}).join('')}</div></section>
      <section class="card qb-panel"><p class="eyebrow">✦ ABILITIES</p><h2>${esc(rank[3])}</h2>${specAbilities.length?specAbilities.map(x=>`<div class="effect-row"><b>${esc(x.split(' · ')[0])}</b><span>${esc(x.split(' · ')[1]||'')}</span></div>`).join(''):'<div class="empty-inline">Specialization abilities unlock as paths deepen.</div>'}</section>
      <section class="card qb-panel qb-specializations"><div class="card-head"><div><p class="eyebrow">🧙 SPECIALIZATIONS</p><h2>Chosen Paths</h2></div>${own?`<span class="count-pill">✦ ${points} point(s)</span>`:''}</div>${specHtml}</section>
      <section class="card qb-panel"><p class="eyebrow">🏋 PHYSICAL RECORD</p><div class="qb-mini-stats">${[['Strength',training.strength],['Endurance',training.endurance],['Agility',training.agility],['Mobility',training.mobility],['Core / Power',training.core_power],['Grip / Climbing',training.grip_climbing]].map(([n,v])=>`<span><b>${fmt(v||0)}</b><small>${esc(n)}</small></span>`).join('')}</div></section>
      ${own?`<section class="card qb-panel"><div class="card-head"><div><p class="eyebrow">🎒 PACK</p><h2>Personal Inventory</h2></div><span class="count-pill">${pack.length}</span></div>${pack.length?`<div class="pack-grid">${pack.map(i=>`<div class="pack-item"><b>${esc(itemName(i))}</b><span>${esc(i.state||'carried')}</span></div>`).join('')}</div>`:'<div class="empty-inline">Your Pack is empty.</div>'}<p class="fine">Pack contents stay private; equipped gear is spouse-visible.</p></section>`:''}
      <section class="card qb-panel"><p class="eyebrow">🏆 ACHIEVEMENTS</p>${achievements.length?`<div class="qb-achievement-grid">${achievements.map(a=>`<span>${esc(a)}</span>`).join('')}</div>`:'<div class="empty-inline">Milestones will populate here as you play.</div>'}</section>
      <section class="card qb-panel qb-history"><p class="eyebrow">📖 RECENT HISTORY</p>${hist}</section>
    </div>`;
  screen.querySelectorAll('[data-qb-char]').forEach(b=>b.onclick=()=>renderCharacterDashboard(b.dataset.qbChar));
  screen.querySelectorAll('[data-qb-spec]').forEach(b=>b.onclick=async()=>{const {error}=await qb.rpc('choose_specialization',{p_specialization_key:b.dataset.qbSpec});if(error)return alert(error.message);renderCharacterDashboard(selected)});
}

async function enhanceGuild(){
  if(activeTab()!=='Guild'||!screen||screen.querySelector('#qbTreasuryActions'))return;
  const id=await identity();if(!id)return;
  const {data:fund}=await qb.from('treasury_funds').select('*').eq('guild_id',id.membership.guild_id).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
  const tx=fund?(await qb.from('treasury_transactions').select('*').eq('fund_id',fund.id).order('created_at',{ascending:false}).limit(6)).data||[]:[];
  const section=document.createElement('section');section.id='qbTreasuryActions';section.className='card qb-panel qb-treasury-actions';
  section.innerHTML=`<div class="card-head"><div><p class="eyebrow">💰 GUILD TREASURY</p><h2>${esc(fund?.name||'No active fund')}</h2></div><span class="count-pill">${fund?`${money(fund.balance)} / ${money(fund.target_amount)} Gold`:'Set up in Guild Admin'}</span></div>${fund?`<div class="qb-treasury-controls"><label>Amount<input id="qbTreasuryAmount" type="number" min="0.01" step="0.01" placeholder="0"></label><button id="qbDepositBtn">＋ Deposit</button><select id="qbWithdrawReason"><option value="INTENDED PURPOSE">Intended Purpose</option><option value="EMERGENCY">Emergency</option><option value="FLAMBOYANT">Flamboyant</option></select><button id="qbWithdrawBtn" class="ghost">− Withdraw</button></div><div class="qb-history-list">${tx.map(t=>`<div class="qb-history-row"><b>${esc(t.tx_type)} ${money(t.amount)} Gold</b><span>${esc(t.reason||'')} · balance ${money(t.balance_after)}</span></div>`).join('')||'<div class="empty-inline">No Treasury transactions yet.</div>'}</div>`:'<div class="empty-inline">No active Treasury fund. Guild Admin can start one.</div>'}${id.membership.role==='admin'?`<div class="qb-admin-inline"><button id="qbNewFundBtn" class="ghost">🏦 Start New Fund</button>${fund?'<button id="qbArchiveFundBtn" class="ghost danger">Archive Current Fund</button>':''}</div>`:''}`;
  const firstTreasury=[...screen.querySelectorAll('.card')].find(x=>/guild treasury|savings|treasury/i.test(x.textContent));
  (firstTreasury?.parentElement||screen).appendChild(section);
  section.querySelector('#qbDepositBtn')?.addEventListener('click',async()=>{const amount=Number(section.querySelector('#qbTreasuryAmount').value);if(!(amount>0))return;const {error}=await qb.rpc('treasury_deposit',{p_amount:amount});if(error)return alert(error.message);clickActive()});
  section.querySelector('#qbWithdrawBtn')?.addEventListener('click',async()=>{const amount=Number(section.querySelector('#qbTreasuryAmount').value),reason=section.querySelector('#qbWithdrawReason').value;if(!(amount>0))return;const {error}=await qb.rpc('treasury_withdraw',{p_amount:amount,p_reason:reason});if(error)return alert(error.message);clickActive()});
  section.querySelector('#qbNewFundBtn')?.addEventListener('click',async()=>{const name=prompt('New Guild Treasury fund name:')?.trim(),goal=Number(prompt('Goal amount:','10000'));if(!name||!(goal>0))return;const {error}=await qb.rpc('admin_new_treasury_fund',{p_name:name,p_goal:goal});if(error)return alert(error.message);clickActive()});
  section.querySelector('#qbArchiveFundBtn')?.addEventListener('click',async()=>{if(!confirm('Archive the current fund? Its history will be preserved.'))return;const {error}=await qb.rpc('admin_archive_treasury_fund');if(error)return alert(error.message);clickActive()});
}

async function enhanceAdmin(){
  if(activeTab()!=='Guild Admin'||!screen||screen.querySelector('#qbWeeklyAdmin'))return;
  const id=await identity();if(!id||id.membership.role!=='admin')return;
  const {data:w}=await qb.from('weekly_challenges').select('*').eq('guild_id',id.membership.guild_id).order('week_key',{ascending:false}).limit(1).maybeSingle();
  const m=meta(w?.metadata),section=document.createElement('section');section.id='qbWeeklyAdmin';section.className='card admin-card qb-weekly-admin';
  section.innerHTML=`<p class="eyebrow">🛡 WEEKLY CHALLENGE CONTROL</p><h2>Edit This Week</h2><div class="admin-form"><label>Title<input id="qbWeekTitle" value="${esc(w?.title||'')}"></label><label>Target<input id="qbWeekTarget" type="number" min="1" value="${Number(w?.target||1)}"></label><label>Unit<input id="qbWeekUnit" value="${esc(w?.unit||'completions')}"></label><label>Campaign XP Reward<input id="qbWeekReward" type="number" min="0" value="${Number(m.reward_campaign_xp||0)}"></label><label class="wide">Description<textarea id="qbWeekDescription">${esc(m.description||'')}</textarea></label></div><div class="admin-actions"><button id="qbSaveWeekly">Save Weekly Challenge</button><button id="qbResetWeekly" class="ghost">Reset Progress</button><button id="qbTestSteps" class="ghost">＋5,000 Test Steps</button></div><p class="fine">These controls exist for beta tuning. Completed reward events remain idempotent even if progress is reset.</p>`;
  const gm=[...screen.querySelectorAll('.admin-card')].find(x=>/beta|gm console|test slow systems/i.test(x.textContent));(gm||screen).insertAdjacentElement('beforebegin',section);
  section.querySelector('#qbSaveWeekly').onclick=async()=>{const {error}=await qb.rpc('admin_update_weekly_challenge',{p_title:section.querySelector('#qbWeekTitle').value.trim(),p_description:section.querySelector('#qbWeekDescription').value.trim(),p_target:Number(section.querySelector('#qbWeekTarget').value),p_unit:section.querySelector('#qbWeekUnit').value.trim(),p_reward_campaign_xp:Math.trunc(Number(section.querySelector('#qbWeekReward').value)||0)});if(error)return alert(error.message);clickActive()};
  section.querySelector('#qbResetWeekly').onclick=async()=>{if(!confirm('Reset this week’s challenge progress to zero?'))return;const {error}=await qb.rpc('admin_reset_weekly_challenge');if(error)return alert(error.message);clickActive()};
  section.querySelector('#qbTestSteps').onclick=async()=>{const {error}=await qb.rpc('log_road_steps',{p_steps:5000,p_source:'admin_test'});if(error)return alert(error.message);alert('Added 5,000 beta-test steps to your Road March total.')};
}

function nthWeekday(y,m,weekday,n){const d=new Date(y,m,1),shift=(weekday-d.getDay()+7)%7;return 1+shift+(n-1)*7}
function lastWeekday(y,m,weekday){const d=new Date(y,m+1,0);return d.getDate()-((d.getDay()-weekday+7)%7)}
function easterDate(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31)-1,day=((h+l-7*m+114)%31)+1;return [month,day]}
function holidayMap(y){const e=easterDate(y);return [
  [0,1,"New Year's Day"],[0,nthWeekday(y,0,1,3),'Martin Luther King Jr. Day'],[1,14,"Valentine's Day"],[1,nthWeekday(y,1,1,3),"Presidents' Day"],[e[0],e[1],'Easter'],[4,lastWeekday(y,4,1),'Memorial Day'],[5,19,'Juneteenth'],[6,4,'Independence Day'],[8,nthWeekday(y,8,1,1),'Labor Day'],[9,nthWeekday(y,9,1,2),'Indigenous Peoples’ / Columbus Day'],[9,31,'Halloween'],[10,11,'Veterans Day'],[10,nthWeekday(y,10,4,4),'Thanksgiving'],[11,24,'Christmas Eve'],[11,25,'Christmas Day'],[11,31,"New Year's Eve"]
].map(([month,day,name])=>({month,day,name}))}
function enhanceCalendar(){
  if(activeTab()!=='Calendar'||!screen||screen.dataset.qbHolidayDone==='1')return;
  const heading=screen.querySelector('.ledger-head h1')?.textContent?.trim();if(!heading)return;
  const parsed=new Date(`${heading} 1`);if(Number.isNaN(parsed.getTime()))return;const y=parsed.getFullYear(),m=parsed.getMonth(),holidays=holidayMap(y).filter(h=>h.month===m);
  const cells=[...screen.querySelectorAll('.calendar-cell')].filter(c=>!c.classList.contains('blank'));
  for(const h of holidays){const cell=cells.find(c=>Number(c.querySelector(':scope > b')?.textContent)===h.day);if(cell&&!cell.querySelector(`[data-qb-holiday="${h.day}"]`)){const span=document.createElement('span');span.className='qb-holiday-event';span.dataset.qbHoliday=h.day;span.textContent=`✦ ${h.name}`;span.title=h.name;cell.appendChild(span)}}
  const card=document.createElement('section');card.className='card home-card qb-holiday-list';card.innerHTML=`<p class="eyebrow">✦ HOLIDAYS & OBSERVANCES</p><h2>${esc(heading)}</h2>${holidays.map(h=>`<div class="qb-history-row"><b>${esc(h.name)}</b><span>${h.day}</span></div>`).join('')}`;
  screen.querySelector('.calendar-layout')?.appendChild(card);screen.dataset.qbHolidayDone='1';
}

let busy=false;
async function polish(){
  if(busy||!screen)return;busy=true;
  try{
    removeRedundantQuestboundTitles();
    const tab=activeTab();
    if(tab==='Character'&&!String(screen.dataset.qbPolished||'').startsWith('character:'))await renderCharacterDashboard();
    else if(tab==='Guild')await enhanceGuild();
    else if(tab==='Guild Admin')await enhanceAdmin();
    else if(tab==='Calendar')enhanceCalendar();
    removeRedundantQuestboundTitles();
  }catch(e){console.warn('Questbound polish layer:',e)}finally{busy=false}
}

const observer=new MutationObserver(()=>{clearTimeout(window.__qbPolishTimer);window.__qbPolishTimer=setTimeout(polish,60)});
observer.observe(document.body,{subtree:true,childList:true});
setTimeout(polish,350);
