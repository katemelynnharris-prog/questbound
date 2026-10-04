const QB3_URL='https://zzvqruhfgjocnwffavcb.supabase.co';
const QB3_KEY='sb_publishable_-nq-Po_ytT0E6uM8vmp1zw_FPftRDVN';
const qb3=window.supabase.createClient(QB3_URL,QB3_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const q3screen=document.querySelector('#screen');
const q3nav=document.querySelector('#mainNav');
const q3esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let q3busy=false,q3timer=null,q3run=0;
const q3tab=()=>document.querySelector('#mainNav button.active')?.textContent?.trim()||'';

function q3toast(msg){let t=document.querySelector('#qbV3Toast');if(!t){t=document.createElement('div');t.id='qbV3Toast';t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200)}
function q3clickTab(label){const b=[...document.querySelectorAll('#mainNav button')].find(x=>x.textContent.trim()===label);if(b)b.click()}
function q3reloadTo(label){sessionStorage.setItem('qb-route-after-reload',label);location.reload()}
async function q3identity(){const {data:{session}}=await qb3.auth.getSession();if(!session)return null;const {data:membership}=await qb3.from('guild_members').select('guild_id,user_id,player_key,role').eq('user_id',session.user.id).maybeSingle();if(!membership)return null;const {data:members=[]}=await qb3.from('guild_members').select('guild_id,user_id,player_key,role,joined_at').eq('guild_id',membership.guild_id);return{session,membership,members}}

q3nav?.addEventListener('click',e=>{if(!e.target.closest('button'))return;q3screen?.classList.add('qb-v3-wait')},{capture:true});

function q3routeAfterReload(){const route=sessionStorage.getItem('qb-route-after-reload');if(!route)return false;const b=[...document.querySelectorAll('#mainNav button')].find(x=>x.textContent.trim()===route);if(!b)return false;sessionStorage.removeItem('qb-route-after-reload');b.click();return true}

async function q3campaign(id){
  if(!['Home','Guild'].includes(q3tab()))return;
  const {data:c}=await qb3.from('campaigns').select('*').eq('guild_id',id.membership.guild_id).in('status',['active','victory']).order('started_at',{ascending:false}).limit(1).maybeSingle();
  const panel=q3screen.querySelector('.campaign-home');if(!panel||!c)return;
  panel.dataset.qbCampaignId=c.id;
  const existing=panel.querySelector('.qb-victory-callout');
  if(c.status!=='victory'&&Number(c.campaign_xp)<Number(c.goal_xp)){existing?.remove();return}
  if(!existing){
    const call=document.createElement('div');call.className='qb-victory-callout';call.innerHTML=`<div><p class="eyebrow">🏆 CAMPAIGN VICTORY</p><h3>The Burden Ends</h3><p>The journey is complete. Claim the victory, archive this Campaign, place its medal in the Hall, and collect the Campaign Victory Cache.</p></div><button class="qb-claim-victory">Claim Victory & Enter the Hall</button>`;
    panel.appendChild(call);call.querySelector('button').onclick=()=>q3claimVictory(c.id);
  }
  const seen=`qb-victory-seen:${c.id}`;if(!sessionStorage.getItem(seen)){sessionStorage.setItem(seen,'1');q3victoryModal(c)}
}
function q3victoryModal(c){
  if(document.querySelector('#qbVictoryModal'))return;
  const m=document.createElement('div');m.id='qbVictoryModal';m.className='qb-victory-modal';m.innerHTML=`<div class="qb-victory-card"><p class="eyebrow">🏆 CAMPAIGN VICTORY</p><div class="qb-victory-mark">🏆</div><h2>The Burden Ends</h2><p>${q3esc(c.name)} has reached ${Number(c.goal_xp||25000).toLocaleString()} Campaign XP. The Hall of History is ready.</p><button data-claim>Claim Victory & Enter the Hall</button><button class="ghost" data-later>View the board first</button></div>`;document.body.appendChild(m);m.querySelector('[data-later]').onclick=()=>m.remove();m.querySelector('[data-claim]').onclick=()=>q3claimVictory(c.id)
}
async function q3claimVictory(){const buttons=document.querySelectorAll('.qb-claim-victory,#qbVictoryModal [data-claim]');buttons.forEach(b=>b.disabled=true);const {data,error}=await qb3.rpc('claim_campaign_victory');if(error){buttons.forEach(b=>b.disabled=false);return alert(error.message)}q3toast(`🏆 ${data?.campaign_name||'Campaign'} archived · Victory Cache awarded`);setTimeout(()=>q3reloadTo('Hall of History'),450)}

async function q3hall(id){
  if(q3tab()!=='Hall of History')return;
  if(q3screen.querySelector('#qbStartCampaign'))return;
  const {data:current}=await qb3.from('campaigns').select('id,status').eq('guild_id',id.membership.guild_id).in('status',['active','victory']).limit(1).maybeSingle();
  if(current)return;
  const s=document.createElement('section');s.id='qbStartCampaign';s.className='card qb-start-campaign';s.innerHTML=`<p class="eyebrow">⚔ THE NEXT CALLING</p><h2>The Hall is quiet. A new road can begin when you are ready.</h2><p>Archived Campaigns remain here permanently. Starting another Campaign resets only the active Campaign track; character progress, gear, achievements, and history remain.</p><button>Start New Campaign</button>`;q3screen.appendChild(s);s.querySelector('button').onclick=async()=>{const name=(prompt('Name the new Campaign:','The Next Calling')||'').trim();if(!name)return;const {error}=await qb3.rpc('start_new_campaign',{p_name:name});if(error)return alert(error.message);q3reloadTo('Home')}
}

async function q3characterItems(id){
  if(q3tab()!=='Character')return;
  const ownSelected=[...q3screen.querySelectorAll('.qb-character-switch button.active')][0]?.textContent?.trim()||id.membership.player_key;if(ownSelected!==id.membership.player_key)return;
  const [{data:items=[]},{data:defs=[]}]=await Promise.all([qb3.from('player_items').select('*').eq('guild_id',id.membership.guild_id).eq('owner_user_id',id.session.user.id).in('state',['pack','unclaimed']),qb3.from('item_definitions').select('*').eq('active',true)]);
  const dmap=Object.fromEntries(defs.map(d=>[d.key,d]));
  for(const item of items){const def=dmap[item.item_key]||{},kind=def.kind||item.metadata?.kind;if(item.state!=='pack'||kind==='gear')continue;const any=q3screen.querySelector(`[data-item-id="${item.id}"]`);if(!any)continue;const actions=any.closest('.qb-pack-actions');if(!actions||actions.querySelector(`[data-qb-use="${item.id}"]`))continue;const b=document.createElement('button');b.dataset.qbUse=item.id;b.textContent=kind==='challenge'?'Use · Throw Gauntlet':'Use Item';b.onclick=()=>q3useItem(item.id);actions.prepend(b)}
}
async function q3useItem(id){const {data,error}=await qb3.rpc('use_player_item',{p_item_id:id});if(error)return alert(error.message);if(data?.kind==='gauntlet')q3toast(`🥊 Gauntlet thrown: ${data.objective}`);else q3toast(`✓ ${data?.name||'Item'} activated`);setTimeout(()=>{if(q3tab()==='Character')q3clickTab('Character');else q3reloadTo('Guild')},250)}

async function q3gauntlets(id){
  if(q3tab()!=='Guild')return;
  const {data:gs=[]}=await qb3.from('gauntlet_challenges').select('*').eq('guild_id',id.membership.guild_id).eq('status','active').order('created_at',{ascending:false});if(!gs.length)return;
  const card=[...q3screen.querySelectorAll('.card')].find(c=>/ACTIVE GAUNTLETS/i.test(c.textContent));if(!card)return;
  for(const g of gs.filter(x=>x.target_user_id===id.session.user.id)){
    const row=[...card.querySelectorAll('.watch-row')].find(r=>r.textContent.includes(g.objective));if(!row||row.querySelector('.qb-gauntlet-actions'))continue;
    const a=document.createElement('div');a.className='qb-gauntlet-actions';a.innerHTML=`<button data-complete>Complete Gauntlet</button>${g.reroll_used?'':`<button class="ghost" data-reroll>↻ Reroll Once</button>`}`;row.appendChild(a);a.querySelector('[data-complete]').onclick=async()=>{const {data,error}=await qb3.rpc('complete_gauntlet_challenge',{p_challenge_id:g.id});if(error)return alert(error.message);q3toast(`🥊 Gauntlet complete · +${data.personal_xp} Personal XP`);q3reloadTo('Guild')};a.querySelector('[data-reroll]')?.addEventListener('click',async()=>{const {error}=await qb3.rpc('reroll_gauntlet_challenge',{p_challenge_id:g.id});if(error)return alert(error.message);q3reloadTo('Guild')})
  }
}

function q3compactGuild(){
  if(q3tab()!=='Guild'||q3screen.querySelector('.qb-guild-grid'))return;
  const treasury=q3screen.querySelector('#qbUnifiedTreasury'),cards=[...q3screen.querySelectorAll('.card')];
  const vault=cards.find(c=>/GUILD VAULT/i.test(c.textContent)),spec=cards.find(c=>/SPECIALIZATIONS/i.test(c.textContent)),gauntlet=cards.find(c=>/ACTIVE GAUNTLETS/i.test(c.textContent)),activity=q3screen.querySelector('.qb-activity-card')||cards.find(c=>/GUILD ACTIVITY/i.test(c.textContent));
  const moving=[vault,spec,gauntlet,activity].filter(Boolean);if(!treasury||moving.length<2)return;
  const grid=document.createElement('div');grid.className='qb-guild-grid';const treasuryWrap=treasury.closest('.home-two');(treasuryWrap||treasury).insertAdjacentElement('afterend',grid);moving.forEach(c=>grid.appendChild(c));q3screen.querySelectorAll('.home-two').forEach(w=>{if(!w.children.length)w.remove()})
}

async function q3admin(id){
  if(q3tab()!=='Guild Admin'||id.membership.role!=='admin')return;
  const beta=q3screen.querySelector('#qbBetaConsole');if(!beta||beta.querySelector('#qbV20Tools'))return;
  const box=document.createElement('div');box.id='qbV20Tools';box.innerHTML=`<hr class="qb-rule"><div class="qb-admin-tool-head"><div><p class="eyebrow">🧪 V20 / V24 PLAYTEST TOOLS</p><h3>Time, Progression & Rare Systems</h3></div><span class="count-pill">BETA ONLY</span></div><div class="qb-v20-tools"><button data-tool="advance">🌙 Advance Day</button><button data-tool="fate-random">🃏 Draw Fate</button><button data-tool="fate-positive">🍀 Positive Fate</button><button data-tool="fate-negative">🌩 Negative Fate</button><button data-tool="kate-xp">＋ Kate XP</button><button data-tool="drew-xp">＋ Drew XP</button><button data-tool="campaign-xp">⚔ Campaign XP</button><button data-tool="fill">🎒 Fill Inventories</button><button data-tool="streak">🔥 Simulate Streak Day</button><button data-tool="loot-selected">🎁 Generate Loot</button><button data-tool="kate-loot">🎁 Kate Loot</button><button data-tool="drew-loot">🎁 Drew Loot</button><button data-tool="party-loot">🎁 Party Loot</button><button data-tool="next-week">🛡 Next Weekly</button><button data-tool="complete-week">✅ Complete Weekly</button></div><hr class="qb-rule"><p class="eyebrow">⚠ PLAYTEST RESETS</p><div class="qb-v20-tools qb-danger-tools"><button data-tool="reset-week" class="ghost">↺ Reset Weekly Progress</button><button data-tool="reset-treasury" class="ghost">↺ Reset Guild Treasury</button><button data-tool="reset-clock" class="ghost">↺ Reset Test Clock</button><button data-tool="reset-all" class="ghost danger">Reset Playtest Data</button></div><p class="fine">Full reset preserves logins, Kate/Drew Guild membership, the canonical quest library, item definitions, and privacy/RLS configuration.</p>`;
  beta.appendChild(box);const selected=()=>beta.querySelector('#qbTestPlayer')?.value||id.membership.player_key;const rpcReload=async(name,args={},route='Guild Admin')=>{const {data,error}=await qb3.rpc(name,args);if(error)return alert(error.message);q3toast('Playtest state updated');setTimeout(()=>q3reloadTo(route),250);return data};
  box.querySelectorAll('[data-tool]').forEach(b=>b.onclick=async()=>{const t=b.dataset.tool;if(t==='advance')return rpcReload('admin_advance_day',{p_days:1},'Home');if(t==='fate-random')return rpcReload('admin_draw_fate',{p_mode:'random'},'Home');if(t==='fate-positive')return rpcReload('admin_draw_fate',{p_mode:'positive'},'Home');if(t==='fate-negative')return rpcReload('admin_draw_fate',{p_mode:'negative'},'Home');if(t==='kate-xp'||t==='drew-xp'){const p=t==='kate-xp'?'Kate':'Drew',n=Math.trunc(Number(prompt(`Adjust ${p} XP by:`,'500')));if(!n)return;return rpcReload('admin_adjust_player_xp',{p_player_key:p,p_amount:n},'Character')}if(t==='campaign-xp'){const n=Math.trunc(Number(prompt('Adjust Campaign XP by:','1000')));if(!n)return;return rpcReload('admin_adjust_campaign_xp',{p_amount:n},'Home')}if(t==='fill')return rpcReload('admin_fill_inventories',{},'Character');if(t==='streak')return rpcReload('admin_simulate_streak_day',{},'Home');if(t==='loot-selected'||t==='kate-loot'||t==='drew-loot'){const p=t==='kate-loot'?'Kate':t==='drew-loot'?'Drew':selected();return rpcReload('admin_generate_loot',{p_player_key:p},'Character')}if(t==='party-loot')return rpcReload('admin_party_loot',{},'Guild');if(t==='next-week')return rpcReload('admin_next_weekly',{},'Home');if(t==='complete-week'){const {data:w,error}=await qb3.from('weekly_challenges').select('*').eq('guild_id',id.membership.guild_id).order('week_key',{ascending:false}).limit(1).maybeSingle();if(error)return alert(error.message);const left=Math.max(0,Number(w?.target||0)-Number(w?.progress||0));if(!left)return q3toast('Weekly Challenge is already complete');return rpcReload('log_weekly_progress',{p_amount:left},'Home')}if(t==='reset-week'){if(!confirm('Reset the current Weekly Challenge progress for testing?'))return;return rpcReload('admin_reset_weekly_challenge',{},'Home')}if(t==='reset-treasury'){if(!confirm('Reset all playtest Treasury funds and transactions?'))return;return rpcReload('admin_reset_treasury_playtest',{},'Guild')}if(t==='reset-clock'){if(!confirm('Return the playtest clock to the real current date?'))return;return rpcReload('admin_reset_playtest_clock',{},'Home')}if(t==='reset-all'){const phrase=prompt('This clears disposable beta progress while preserving accounts, Guild membership, quest definitions and privacy settings. Type RESET PLAYTEST to continue.','');if(phrase!=='RESET PLAYTEST')return;const {error}=await qb3.rpc('admin_reset_playtest_data');if(error)return alert(error.message);sessionStorage.clear();q3toast('Playtest data reset');setTimeout(()=>location.reload(),350)}})
}

async function q3enhance(){
  if(q3busy||!q3screen)return;q3busy=true;const run=++q3run;q3screen.classList.add('qb-v3-wait');
  try{if(q3routeAfterReload())return;const id=await q3identity();if(!id)return;const tab=q3tab();if(tab==='Home'||tab==='Guild')await q3campaign(id);if(tab==='Guild'){q3compactGuild();await q3gauntlets(id)}if(tab==='Character')await q3characterItems(id);if(tab==='Hall of History')await q3hall(id);if(tab==='Guild Admin')await q3admin(id)}catch(e){console.warn('Questbound UI v3:',e)}finally{q3busy=false;if(run===q3run)requestAnimationFrame(()=>q3screen.classList.remove('qb-v3-wait'))}
}
function q3schedule(){clearTimeout(q3timer);q3timer=setTimeout(q3enhance,75)}
const q3observer=new MutationObserver(q3schedule);if(q3screen)q3observer.observe(q3screen,{childList:true,subtree:true});
setTimeout(q3enhance,320);
