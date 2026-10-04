const QB_URL='https://zzvqruhfgjocnwffavcb.supabase.co';
const QB_KEY='sb_publishable_-nq-Po_ytT0E6uM8vmp1zw_FPftRDVN';
const qb2=window.supabase.createClient(QB_URL,QB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const qbScreen=document.querySelector('#screen');
const qbNav=document.querySelector('#mainNav');
const qesc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qfmt=n=>Number(n||0).toLocaleString();
const qmoney=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
const qmeta=v=>v&&typeof v==='object'?v:{};
const qtab=()=>document.querySelector('#mainNav button.active')?.textContent?.trim()||'';
const qrank=l=>[[1,4,'Initiate','The Ledger'],[5,9,'Cadet','Second Wind'],[10,14,'Crawler','Loot Find'],[15,19,'Rider','Signet'],[20,24,'Pathfinder','Rested'],[25,29,'Witcher',"Witcher's Contract"],[30,39,'Champion','Rally'],[40,49,'Wingleader',"Commander's Favor"],[50,59,'Grandmaster','Masterwork'],[60,74,'Commander','War Council'],[75,99,'Ascendant','Legendary Draw'],[100,9999,'Legend','Prestige']].find(r=>l>=r[0]&&l<=r[1])||[100,9999,'Legend','Prestige'];
const SPEC={Archivist:{desc:'Knowledge, reading, study, and writing.',abilities:['Deep Study','Research Expedition']},Vanguard:{desc:'Training, resilience, and physical trials.',abilities:['Second Wind','Battle Rhythm']},Pathfinder:{desc:'Exploration, Renown, and discovery.',abilities:['Cartographer','Farther Roads']},Steward:{desc:'Home, finance, and keeping the Guild strong.',abilities:['Good Order','Guild Provisioner']}};
let qbRun=0,qbTimer=null,qbBusy=false,qbSelectedCharacter=null;

async function qidentity(){
  const {data:{session}}=await qb2.auth.getSession(); if(!session)return null;
  const {data:membership}=await qb2.from('guild_members').select('guild_id,user_id,player_key,role').eq('user_id',session.user.id).maybeSingle();
  if(!membership)return null;
  const {data:members=[]}=await qb2.from('guild_members').select('guild_id,user_id,player_key,role,joined_at').eq('guild_id',membership.guild_id).order('joined_at');
  return {session,membership,members};
}
function qitemName(i,d){return qmeta(i?.metadata).name||d?.name||String(i?.item_key||'').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function qslot(raw){const s=String(raw||'').toLowerCase();return ({head:'Helm',helm:'Helm',chest:'Chest',hands:'Gauntlets',main_hand:'Weapon I',off_hand:'Weapon II',legs:'Leggings',feet:'Boots',charm:'Relic I',relic2:'Relic II'}[s]||raw)}
function qrefresh(){const b=document.querySelector('#mainNav button.active'); if(b)b.click()}
function qtoast(msg){let t=document.querySelector('#qbV2Toast');if(!t){t=document.createElement('div');t.id='qbV2Toast';t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function qremoveQuestboundTitles(){qbScreen?.querySelectorAll('h1,h2').forEach(h=>{if(h.textContent.trim().toLowerCase()==='questbound')h.remove()})}

qbNav?.addEventListener('click',e=>{
  if(!e.target.closest('button'))return;
  qbScreen?.classList.add('qb-switching');
  if(qbScreen)qbScreen.dataset.qbV2='';
},{capture:true});

async function qactivityCard(id,limit=8){
  const {data:events=[]}=await qb2.from('activity_events').select('*').eq('guild_id',id.membership.guild_id).order('created_at',{ascending:false}).limit(limit);
  const names=Object.fromEntries(id.members.map(m=>[m.user_id,m.player_key]));
  return `<section class="card home-card qb-activity-card"><p class="eyebrow">📖 GUILD ACTIVITY</p><div class="activity">${events.map(a=>{const actor=names[a.actor_user_id]||'Guild',target=a.target_user_id&&a.target_user_id!==a.actor_user_id?` → ${names[a.target_user_id]||'Player'}`:'';const rewards=[a.personal_xp?`${a.personal_xp>0?'+':''}${a.personal_xp} Personal XP`:'',a.campaign_xp?`${a.campaign_xp>0?'+':''}${a.campaign_xp} Campaign XP`:''].filter(Boolean).join(' · ');return `<div class="activity-row"><b>${qesc(actor+target)} · ${qesc(a.message||a.event_type)}</b><small>${rewards?`${qesc(rewards)} · `:''}${new Date(a.created_at).toLocaleString()}</small></div>`}).join('')||'<div class="empty-inline">No Guild activity yet.</div>'}</div></section>`;
}
async function qreplaceActivity(id){
  if(!['Home','Guild'].includes(qtab()))return;
  const cards=[...qbScreen.querySelectorAll('.card')];
  const old=cards.find(c=>/guild activity/i.test(c.textContent));
  if(!old)return;
  const wrap=document.createElement('div');wrap.innerHTML=await qactivityCard(id);old.replaceWith(wrap.firstElementChild);
}

async function qrenderCharacter(id){
  if(qtab()!=='Character')return;
  const selected=qbSelectedCharacter||id.membership.player_key;
  const target=id.members.find(m=>m.player_key===selected)||id.membership;
  qbSelectedCharacter=target.player_key;
  const own=target.user_id===id.session.user.id;
  const [pR,iR,dR,tR,sR,aR,eR,cR]=await Promise.all([
    qb2.from('player_progress_public').select('*').eq('guild_id',id.membership.guild_id).eq('user_id',target.user_id).maybeSingle(),
    qb2.from('player_items').select('*').eq('guild_id',id.membership.guild_id).eq('owner_user_id',target.user_id).neq('state','discarded').order('acquired_at',{ascending:false}),
    qb2.from('item_definitions').select('*').eq('active',true),
    qb2.from('training_stats').select('*').eq('guild_id',id.membership.guild_id).eq('user_id',target.user_id).maybeSingle(),
    own?qb2.from('player_specializations').select('*').eq('guild_id',id.membership.guild_id).eq('user_id',target.user_id):Promise.resolve({data:[]}),
    qb2.from('activity_events').select('*').eq('guild_id',id.membership.guild_id).or(`actor_user_id.eq.${target.user_id},target_user_id.eq.${target.user_id}`).order('created_at',{ascending:false}).limit(8),
    qb2.from('exploration_state').select('*').eq('guild_id',id.membership.guild_id).maybeSingle(),
    qb2.from('campaigns').select('id,status').eq('guild_id',id.membership.guild_id).in('status',['active','victory']).limit(1).maybeSingle()
  ]);
  const progress=pR.data||{},items=iR.data||[],defs=Object.fromEntries((dR.data||[]).map(d=>[d.key,d])),training=tR.data||{},specs=sR.data||[],explore=eR.data||{};
  let contrib=0;if(cR.data?.id){const r=await qb2.from('campaign_contributions').select('campaign_xp').eq('campaign_id',cR.data.id).eq('user_id',target.user_id).maybeSingle();contrib=Number(r.data?.campaign_xp||0)}
  const xp=Number(progress.personal_xp||0),level=Number(progress.level||1),rank=qrank(level),sprite=window.QB_SPRITES?.[target.player_key]||'';
  const equipped=items.filter(i=>i.state==='equipped'),pack=own?items.filter(i=>i.state!=='equipped'):[];
  const slots=['Helm','Chest','Gauntlets','Weapon I','Weapon II','Leggings','Relic I','Boots','Relic II'];
  const slotItem=s=>equipped.find(i=>qslot(i.equipped_slot||defs[i.item_key]?.slot)===s);
  const earned=1+Math.floor(level/10),spent=specs.reduce((n,s)=>n+Number(s.rank||0),0),points=Math.max(0,earned-spent),activeSpecs=specs.filter(s=>Number(s.rank)>0).length;
  const abilities=specs.flatMap(s=>(SPEC[s.specialization_key]?.abilities||[]).slice(0,Number(s.rank||0)).map(a=>({name:a,path:s.specialization_key})));
  const history=(aR.data||[]).map(a=>`<div class="qb-history-row"><b>${qesc(a.message||a.event_type)}</b><span>${new Date(a.created_at).toLocaleDateString()}</span></div>`).join('')||'<div class="empty-inline">No personal history yet.</div>';
  const achievements=[xp>0&&'First Quest',Number(training.training_sessions||0)>0&&'Training Begun',Number(explore.renown||0)>0&&'Beyond the Keep',level>=5&&'Cadet Rank'].filter(Boolean);
  const loadout=slots.map(s=>{const i=slotItem(s),d=i?defs[i.item_key]:null;return `<div class="gear-slot ${i?'filled':'empty-slot'}"><small>${qesc(s)}</small><b>${i?qesc(qitemName(i,d)):'Empty'}</b>${i?`<em>${qesc(d?.rarity||qmeta(i.metadata).rarity||'equipped')}</em>${own?`<button class="qb-item-mini" data-item-action="unequip" data-item-id="${i.id}">Unequip</button>`:''}`:''}</div>`}).join('');
  const specHtml=own?Object.entries(SPEC).map(([name,d])=>{const r=Number(specs.find(s=>s.specialization_key===name)?.rank||0),blocked=points<=0||r>=5||(r===0&&activeSpecs>=3);return `<div class="qb-spec-row"><div><b>${qesc(name)} · ${r?'Rank '+r:'Unlearned'}</b><span>${qesc(d.desc)}</span></div><button data-qb-spec="${qesc(name)}" ${blocked?'disabled':''}>${r?'Deepen':'Learn'}</button></div>`}).join(''):'<div class="empty-inline">Specializations are private to their player.</div>';
  const packHtml=pack.length?pack.map(i=>{const d=defs[i.item_key]||{},kind=d.kind||qmeta(i.metadata).kind,transfer=d.transferable!==false;return `<div class="qb-pack-item"><div><b>${qesc(qitemName(i,d))}</b><span>${qesc(d.rarity||qmeta(i.metadata).rarity||i.state)} · ${qesc(d.description||qmeta(i.metadata).description||'')}</span></div><div class="qb-pack-actions">${i.state==='unclaimed'?`<button data-item-action="claim" data-item-id="${i.id}">Keep</button>`:''}${kind==='gear'?`<button data-item-action="equip" data-item-id="${i.id}">Equip</button>`:''}${transfer?`<button class="ghost" data-item-action="give" data-item-id="${i.id}">Give</button>`:''}<button class="ghost danger" data-item-action="discard" data-item-id="${i.id}">Discard</button></div></div>`}).join(''):'<div class="empty-inline">Your Pack is empty.</div>';
  qbScreen.dataset.qbV2=`Character:${target.player_key}`;
  qbScreen.innerHTML=`<section class="qb-character-hero"><div class="qb-character-art"><img src="${sprite}" alt="${qesc(target.player_key)} sprite"></div><div class="qb-character-summary"><div class="qb-character-switch">${id.members.map(m=>`<button data-qb-char="${qesc(m.player_key)}" class="${m.player_key===target.player_key?'active':''}">${qesc(m.player_key)}</button>`).join('')}</div><p class="eyebrow">${qesc(rank[2])} · LEVEL ${level}</p><h1>${qesc(target.player_key)}</h1><p>${qfmt(xp)} Personal XP · ${qfmt(contrib)} Campaign contribution</p><div class="qb-stat-strip"><span><b>${qfmt(progress.defense||0)}</b><small>Defense</small></span><span><b>${qfmt(progress.ward||0)}</b><small>Ward</small></span><span><b>${qfmt(progress.fortune||0)}</b><small>Fortune</small></span><span><b>${qfmt(training.training_sessions||0)}</b><small>Training</small></span><span><b>${qfmt(explore.renown||0)}</b><small>Renown</small></span></div></div></section>
  <div class="qb-character-columns"><div class="qb-character-column"><section class="card qb-panel"><div class="card-head"><div><p class="eyebrow">⚔ LOADOUT</p><h2>Equipped Gear</h2></div><span class="count-pill">${equipped.length} / 9</span></div><div class="gear-grid">${loadout}</div></section><section class="card qb-panel"><p class="eyebrow">🏋 PHYSICAL RECORD</p><div class="qb-mini-stats">${[['Strength',training.strength],['Endurance',training.endurance],['Agility',training.agility],['Mobility',training.mobility],['Core / Power',training.core_power],['Grip / Climbing',training.grip_climbing]].map(([n,v])=>`<span><b>${qfmt(v||0)}</b><small>${qesc(n)}</small></span>`).join('')}</div></section><section class="card qb-panel"><p class="eyebrow">🏆 ACHIEVEMENTS</p>${achievements.length?`<div class="qb-achievement-grid">${achievements.map(a=>`<span>${qesc(a)}</span>`).join('')}</div>`:'<div class="empty-inline">Milestones will populate here as you play.</div>'}</section></div>
  <div class="qb-character-column"><section class="card qb-panel"><p class="eyebrow">✦ ABILITIES</p><h2>${qesc(rank[3])}</h2>${abilities.length?abilities.map(a=>`<div class="effect-row"><b>${qesc(a.name)}</b><span>${qesc(a.path)}</span></div>`).join(''):'<div class="empty-inline">Specialization abilities unlock as paths deepen.</div>'}</section><section class="card qb-panel"><div class="card-head"><div><p class="eyebrow">🧙 SPECIALIZATIONS</p><h2>Chosen Paths</h2></div>${own?`<span class="count-pill">✦ ${points} point(s)</span>`:''}</div>${specHtml}</section>${own?`<section class="card qb-panel"><div class="card-head"><div><p class="eyebrow">🎒 PACK</p><h2>Personal Inventory</h2></div><span class="count-pill">${pack.length}</span></div><div class="qb-pack-list">${packHtml}</div><p class="fine">Pack contents stay private; equipped gear is spouse-visible.</p></section>`:''}<section class="card qb-panel"><p class="eyebrow">📖 RECENT HISTORY</p>${history}</section></div></div>`;
  qbScreen.querySelectorAll('[data-qb-char]').forEach(b=>b.onclick=()=>{qbSelectedCharacter=b.dataset.qbChar;qrenderCharacter(id)});
  qbScreen.querySelectorAll('[data-qb-spec]').forEach(b=>b.onclick=async()=>{const {error}=await qb2.rpc('choose_specialization',{p_specialization_key:b.dataset.qbSpec});if(error)return alert(error.message);qrenderCharacter(id)});
  qbScreen.querySelectorAll('[data-item-action]').forEach(b=>b.onclick=()=>qitemAction(b.dataset.itemAction,b.dataset.itemId,id));
}
async function qitemAction(action,itemId,id){
  let r={error:null};
  if(action==='equip')r=await qb2.rpc('equip_player_item',{p_item_id:itemId});
  if(action==='unequip')r=await qb2.rpc('unequip_player_item',{p_item_id:itemId});
  if(action==='discard'){if(!confirm('Discard this item?'))return;r=await qb2.rpc('discard_player_item',{p_item_id:itemId})}
  if(action==='give'){if(!confirm('Give this item to your spouse?'))return;r=await qb2.rpc('give_player_item_to_spouse',{p_item_id:itemId})}
  if(action==='claim')r=await qb2.from('player_items').update({state:'pack'}).eq('id',itemId);
  if(r.error)return alert(r.error.message);qtoast('Inventory updated');qrenderCharacter(id);
}

async function qguildTreasury(id){
  if(qtab()!=='Guild')return;
  const {data:fund}=await qb2.from('treasury_funds').select('*').eq('guild_id',id.membership.guild_id).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
  const tx=fund?(await qb2.from('treasury_transactions').select('*').eq('fund_id',fund.id).order('created_at',{ascending:false}).limit(6)).data||[]:[];
  const cards=[...qbScreen.querySelectorAll('.card')].filter(c=>/guild treasury|treasury|savings goal/i.test(c.textContent));
  let card=cards.shift(); if(!card){card=document.createElement('section');card.className='card home-card';qbScreen.prepend(card)} cards.forEach(c=>c.remove());
  const pct=fund?Math.min(100,Number(fund.balance||0)/Number(fund.target_amount||1)*100):0;
  card.id='qbUnifiedTreasury';
  card.innerHTML=`<div class="card-head"><div><p class="eyebrow">💰 GUILD TREASURY</p><h2>${qesc(fund?.name||'No active fund')}</h2></div><span class="count-pill">${fund?`${qmoney(fund.balance)} / ${qmoney(fund.target_amount)} Gold`:'Not configured'}</span></div>${fund?`<div class="progress"><span style="width:${pct}%"></span></div><div class="qb-treasury-controls"><label>Amount<input id="qbAmount" type="number" min="0.01" step="0.01" placeholder="0"></label><button id="qbDeposit">＋ Deposit</button><select id="qbReason"><option value="INTENDED PURPOSE">Intended Purpose</option><option value="EMERGENCY">Emergency</option><option value="FLAMBOYANT">Flamboyant</option></select><button id="qbWithdraw" class="ghost">− Withdraw</button></div><div class="qb-history-list">${tx.map(t=>`<div class="qb-history-row"><b>${qesc(t.tx_type)} ${qmoney(t.amount)} Gold</b><span>${qesc(t.reason||'')} · balance ${qmoney(t.balance_after)}</span></div>`).join('')||'<div class="empty-inline">No Treasury transactions yet.</div>'}</div>`:'<div class="empty-inline">Start the first Guild fund from Guild Admin.</div>'}${id.membership.role==='admin'?`<div class="qb-admin-inline"><button id="qbNewFund" class="ghost">🏦 Start New Fund</button>${fund?'<button id="qbArchiveFund" class="ghost danger">Archive Current Fund</button>':''}</div>`:''}`;
  card.querySelector('#qbDeposit')?.addEventListener('click',async()=>{const a=Number(card.querySelector('#qbAmount').value);if(!(a>0))return;const {error}=await qb2.rpc('treasury_deposit',{p_amount:a});if(error)return alert(error.message);qrefresh()});
  card.querySelector('#qbWithdraw')?.addEventListener('click',async()=>{const a=Number(card.querySelector('#qbAmount').value),reason=card.querySelector('#qbReason').value;if(!(a>0))return;const {error}=await qb2.rpc('treasury_withdraw',{p_amount:a,p_reason:reason});if(error)return alert(error.message);qrefresh()});
  card.querySelector('#qbNewFund')?.addEventListener('click',async()=>{const name=prompt('New fund name:')?.trim(),goal=Number(prompt('Goal amount:','10000'));if(!name||!(goal>0))return;const {error}=await qb2.rpc('admin_new_treasury_fund',{p_name:name,p_goal:goal});if(error)return alert(error.message);qrefresh()});
  card.querySelector('#qbArchiveFund')?.addEventListener('click',async()=>{if(!confirm('Archive this fund? Its history will remain in Questbound.'))return;const {error}=await qb2.rpc('admin_archive_treasury_fund');if(error)return alert(error.message);qrefresh()});
}

function qholidayMap(y){
  const nth=(m,w,n)=>{const d=new Date(y,m,1);return 1+((w-d.getDay()+7)%7)+(n-1)*7},last=(m,w)=>{const d=new Date(y,m+1,0);return d.getDate()-((d.getDay()-w+7)%7)};
  const easter=(()=>{const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31)-1,day=((h+l-7*m+114)%31)+1;return [mo,day]})();
  return [[0,1,"New Year's Day"],[0,nth(0,1,3),'Martin Luther King Jr. Day'],[1,14,"Valentine's Day"],[1,nth(1,1,3),"Presidents' Day"],[easter[0],easter[1],'Easter'],[4,last(4,1),'Memorial Day'],[5,19,'Juneteenth'],[6,4,'Independence Day'],[8,nth(8,1,1),'Labor Day'],[9,nth(9,1,2),'Indigenous Peoples’ / Columbus Day'],[9,31,'Halloween'],[10,11,'Veterans Day'],[10,nth(10,4,4),'Thanksgiving'],[11,24,'Christmas Eve'],[11,25,'Christmas Day'],[11,31,"New Year's Eve"]].map(([month,day,name])=>({month,day,name}));
}
function qcalendar(){
  if(qtab()!=='Calendar')return;
  const layout=qbScreen.querySelector('.calendar-layout'),heading=qbScreen.querySelector('.ledger-head h1')?.textContent?.trim();if(!layout||!heading)return;
  const parsed=new Date(`${heading} 1`);if(Number.isNaN(parsed.getTime()))return;const y=parsed.getFullYear(),m=parsed.getMonth(),holidays=qholidayMap(y).filter(h=>h.month===m);
  const cells=[...qbScreen.querySelectorAll('.calendar-cell')].filter(c=>!c.classList.contains('blank'));
  holidays.forEach(h=>{const cell=cells.find(c=>Number(c.querySelector(':scope > b')?.textContent)===h.day);if(cell&&!cell.querySelector(`[data-qb-holiday="${h.day}"]`)){const s=document.createElement('span');s.className='qb-holiday-event';s.dataset.qbHoliday=h.day;s.textContent=`✦ ${h.name}`;cell.appendChild(s)}});
  if(!layout.querySelector('.qb-calendar-left')){const children=[...layout.children],cal=children[0],watch=children[1];const left=document.createElement('div');left.className='qb-calendar-left';layout.insertBefore(left,cal);left.appendChild(cal);const h=document.createElement('section');h.className='card home-card qb-holiday-list';h.innerHTML=`<p class="eyebrow">✦ HOLIDAYS & OBSERVANCES</p><h2>${qesc(heading)}</h2>${holidays.map(x=>`<div class="qb-history-row"><b>${qesc(x.name)}</b><span>${x.day}</span></div>`).join('')}`;left.appendChild(h);if(watch)watch.classList.add('qb-calendar-watch')}
}

async function qadmin(id){
  if(qtab()!=='Guild Admin'||id.membership.role!=='admin')return;
  if(qbScreen.querySelector('#qbBetaConsole'))return;
  const [{data:defs=[]},{data:w}]=await Promise.all([qb2.from('item_definitions').select('*').eq('active',true).order('kind').order('rarity').order('name'),qb2.from('weekly_challenges').select('*').eq('guild_id',id.membership.guild_id).order('week_key',{ascending:false}).limit(1).maybeSingle()]);
  const wm=qmeta(w?.metadata),section=document.createElement('section');section.id='qbBetaConsole';section.className='card admin-card qb-beta-console';
  section.innerHTML=`<p class="eyebrow">🧪 PLAYTEST CONSOLE</p><h2>Force Slow Systems</h2><p class="fine">These controls exist only to test systems that would otherwise take days or weeks.</p><div class="qb-beta-grid"><label>Player<select id="qbTestPlayer">${id.members.map(m=>`<option>${qesc(m.player_key)}</option>`).join('')}</select></label><label>Item / Loot<select id="qbTestItem">${defs.map(d=>`<option value="${qesc(d.key)}">${qesc(d.name)} · ${qesc(d.rarity)}</option>`).join('')}</select></label><label>Grant as<select id="qbTestState"><option value="unclaimed">Unclaimed loot</option><option value="pack">Pack</option><option value="equipped">Equipped</option></select></label><button id="qbGrantItem">🎁 Grant Item</button><label>Today’s Fate<select id="qbFate"><option value="quiet">Quiet Roads</option><option value="bold">Fortune Favors the Bold</option><option value="mischief">Mischief</option><option value="company">Company of Two</option><option value="fortune">Fortune Smiles</option><option value="homefront">Homefront</option><option value="longroad">The Long Road</option></select></label><button id="qbForceFate">✦ Force Fate</button><button id="qbFiveSteps">🥾 +5,000 Test Steps</button><button id="qbGauntletItem">🥊 Grant Gauntlet Token</button><button id="qbSafePassage">📜 Grant Safe Passage</button></div><hr class="qb-rule"><p class="eyebrow">🛡 WEEKLY CHALLENGE</p><div class="admin-form"><label>Title<input id="qbWeekTitle" value="${qesc(w?.title||'')}"></label><label>Target<input id="qbWeekTarget" type="number" min="1" value="${Number(w?.target||1)}"></label><label>Unit<input id="qbWeekUnit" value="${qesc(w?.unit||'completions')}"></label><label>Campaign XP Reward<input id="qbWeekReward" type="number" min="0" value="${Number(wm.reward_campaign_xp||0)}"></label><label class="wide">Description<textarea id="qbWeekDesc">${qesc(wm.description||'')}</textarea></label></div><div class="admin-actions"><button id="qbSaveWeek">Save Weekly Challenge</button><button id="qbResetWeek" class="ghost">Reset Progress</button></div>`;
  qbScreen.appendChild(section);
  const grant=async(key,state=null)=>{const player=section.querySelector('#qbTestPlayer').value,item=key||section.querySelector('#qbTestItem').value,s=state||section.querySelector('#qbTestState').value;const {error}=await qb2.rpc('admin_grant_test_item',{p_player_key:player,p_item_key:item,p_state:s});if(error)return alert(error.message);qtoast('Test item granted')};
  section.querySelector('#qbGrantItem').onclick=()=>grant();section.querySelector('#qbGauntletItem').onclick=()=>grant('gauntlet-token','pack');section.querySelector('#qbSafePassage').onclick=()=>grant('safe-passage','pack');
  section.querySelector('#qbForceFate').onclick=async()=>{const {error}=await qb2.rpc('admin_force_fate',{p_fate_key:section.querySelector('#qbFate').value});if(error)return alert(error.message);qtoast('Today’s Fate changed')};
  section.querySelector('#qbFiveSteps').onclick=async()=>{const {error}=await qb2.rpc('log_road_steps',{p_steps:5000,p_source:'admin'});if(error)return alert(error.message);qtoast('+5,000 test steps')};
  section.querySelector('#qbSaveWeek').onclick=async()=>{const {error}=await qb2.rpc('admin_update_weekly_challenge',{p_title:section.querySelector('#qbWeekTitle').value.trim(),p_description:section.querySelector('#qbWeekDesc').value.trim(),p_target:Number(section.querySelector('#qbWeekTarget').value),p_unit:section.querySelector('#qbWeekUnit').value.trim(),p_reward_campaign_xp:Number(section.querySelector('#qbWeekReward').value)});if(error)return alert(error.message);qtoast('Weekly challenge updated')};
  section.querySelector('#qbResetWeek').onclick=async()=>{if(!confirm('Reset this week’s challenge progress for testing?'))return;const {error}=await qb2.rpc('admin_reset_weekly_challenge');if(error)return alert(error.message);qtoast('Weekly challenge reset')};
}

async function qlevelFanfare(id){
  const {data:e}=await qb2.from('activity_events').select('*').eq('guild_id',id.membership.guild_id).eq('target_user_id',id.session.user.id).eq('event_type','level_up').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(!e)return; const age=Date.now()-new Date(e.created_at).getTime(); if(age>15*60*1000||sessionStorage.getItem('qb-seen-level-'+e.id))return;
  sessionStorage.setItem('qb-seen-level-'+e.id,'1'); const lvl=qmeta(e.metadata).new_level||String(e.message).match(/\d+/)?.[0]||'';
  const {data:loot}=await qb2.from('activity_events').select('*').eq('guild_id',id.membership.guild_id).eq('target_user_id',id.session.user.id).eq('event_type','loot_drop').gte('created_at',e.created_at).order('created_at',{ascending:true}).limit(1).maybeSingle();
  const modal=document.createElement('div');modal.className='qb-level-modal';modal.innerHTML=`<div class="qb-level-card"><p class="eyebrow">✦ RANK ADVANCEMENT</p><div class="qb-level-number">${qesc(lvl)}</div><h2>Level Up</h2><p>The road has changed. Your progress has been recorded in the Guild ledger.</p>${loot?`<div class="qb-level-loot">🎁 ${qesc(loot.message)}</div>`:'<p class="fine">Milestone levels (5, 10, 15…) also award a loot cache.</p>'}<button>Continue</button></div>`;document.body.appendChild(modal);modal.querySelector('button').onclick=()=>modal.remove();
}

async function qenhance(){
  if(qbBusy||!qbScreen)return; qbBusy=true; const run=++qbRun;
  try{
    qremoveQuestboundTitles(); const tab=qtab(),id=await qidentity(); if(!id)return;
    if(tab==='Character')await qrenderCharacter(id);
    else if(tab==='Guild'){await qguildTreasury(id);await qreplaceActivity(id)}
    else if(tab==='Guild Admin')await qadmin(id);
    else if(tab==='Calendar')qcalendar();
    else if(tab==='Home')await qreplaceActivity(id);
    qremoveQuestboundTitles(); await qlevelFanfare(id);
  }catch(e){console.warn('Questbound UI v2:',e)}finally{
    qbBusy=false;if(run===qbRun)requestAnimationFrame(()=>qbScreen.classList.remove('qb-switching'));
  }
}
function qschedule(){clearTimeout(qbTimer);qbTimer=setTimeout(qenhance,35)}
const qbObserver=new MutationObserver(qschedule);if(qbScreen)qbObserver.observe(qbScreen,{childList:true,subtree:true});
setTimeout(qenhance,180);
