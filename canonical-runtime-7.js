// === Questbound V24 parity correction pass (runtime 7): daily counters, Pack, Locked In, date fidelity ===
// Loaded into the same canonical renderer source before first execution. No observers / no post-render loop.

function qbCompletionDate(c){
  if(c?.effective_date) return String(c.effective_date).slice(0,10);
  return c?.completed_at ? localDate(new Date(c.completed_at)) : localDate();
}

async function loadCompletions(){
  const since=new Date(Date.now()-180*86400000).toISOString();
  const {data,error}=await sb.from('quest_completions')
    .select('id,quest_id,completed_by,subject_user_id,occurrence_key,source,completed_at,effective_date,campaign_xp_awarded,modifiers,reversed_at')
    .eq('guild_id',state.membership.guild_id)
    .gte('completed_at',since)
    .order('completed_at',{ascending:false});
  if(error) throw error;
  state.completions=data||[];
}

function playerItemsVisible(uid){
  return (state.playerItems||[]).filter(i=>i.owner_user_id===uid && !['discarded','consumed'].includes(String(i.state||'')));
}
function ownItems(){ return playerItemsVisible(ownUserId()); }

function qbCountTarget(q){
  const r=safeMeta(q?.recurrence);
  const n=Number(r.count_target||1);
  return Number.isFinite(n)&&n>1?Math.floor(n):1;
}
function qbDailyCount(q,uid=ownUserId(),date=localDate()){
  if(!q) return 0;
  return state.completions.filter(c=>!c.reversed_at && c.quest_id===q.id && qbCompletionDate(c)===date && (q.owner_type==='co-op' || c.subject_user_id===uid)).length;
}
function occurrenceKey(q){
  const date=localDate(),r=safeMeta(q?.recurrence),type=r.type||'once',target=qbCountTarget(q);
  if(type==='once')return'once';
  if(type==='daily')return target>1?`${date}:step:${Math.min(target,qbDailyCount(q)+1)}`:date;
  if(type==='weekly')return`week:${weekKey()}`;
  if(type==='monthly_fixed'||type==='monthly_dates')return`${type}:${date.slice(0,7)}`;
  if(type==='interval'||type==='frequency')return`${type}:${date.slice(0,7)}`;
  if(type==='seasonal'||type==='seasonal_wildcard')return`${type}:${date.slice(0,4)}`;
  if(type==='room_slots')return`${type}:${date}`;
  return`${type}:${date}`;
}
function isCompletedForCurrentOccurrence(q){
  const r=safeMeta(q?.recurrence),target=qbCountTarget(q);
  if((r.type||'once')==='daily'&&target>1) return qbDailyCount(q)>=target;
  const occ=occurrenceKey(q);
  return state.completions.some(c=>!c.reversed_at&&c.quest_id===q.id&&c.occurrence_key===occ&&(q.owner_type!=='personal_daily'||c.subject_user_id===ownUserId()));
}
function questRow(q,{featured=false,compact=false}={}){
  const completed=isCompletedForCurrentOccurrence(q),eligible=canOwnQuest(q),target=qbCountTarget(q),r=safeMeta(q.recurrence),multi=(r.type||'once')==='daily'&&target>1,current=multi?qbDailyCount(q):0;
  const personal=featured?Math.round(Number(q.xp_personal||0)*1.2):Number(q.xp_personal||0);
  const progress=multi?`<span class="qb-count-progress ${completed?'done':''}">${Math.min(current,target)} / ${target}</span>`:'';
  const action=completed?'Done':!eligible?'Assigned to spouse':multi?`Log ${Math.min(current+1,target)} / ${target}`:'Complete';
  return `<div class="quest ${compact?'compact':''} ${completed?'done':''}" data-quest-id="${q.id}"><div><div class="quest-title">${completed?'✓ ':''}${esc(q.title)} ${progress}</div><div class="quest-chips"><span>${esc(q.category)}</span><span>${esc(ownerLabel(q))}</span>${featured?'<span class="featured">★ +20% FEATURED BONUS</span>':''}</div><div class="quest-meta">+${fmt(personal)} personal · +${fmt(q.xp_campaign)} campaign${multi?' total at daily target':''}${q.major_achievement?' · Major Achievement':''}</div></div><div class="quest-actions"><button data-complete="${q.id}" data-source="${featured?'featured':'journal'}" ${completed||!eligible?'disabled':''}>${action}</button></div></div>`;
}

function playerStreak(uid){
  if(!uid)return 0;
  const set=new Set(state.completions.filter(c=>!c.reversed_at&&(c.completed_by===uid||c.subject_user_id===uid)).map(qbCompletionDate));
  return streakFromSet(set);
}
function drewLockedData(){
  const drew=memberByKey('Drew');if(!drew)return{streak:0,secured:false};
  const protein=state.quests.find(q=>q.key==='meet-protein-goal'),calories=state.quests.find(q=>q.key==='meet-calorie-goal');
  if(!protein||!calories)return{streak:0,secured:false};
  const p=new Set(),c=new Set();
  state.completions.filter(x=>!x.reversed_at&&(x.subject_user_id===drew.user_id||x.completed_by===drew.user_id)).forEach(x=>{const d=qbCompletionDate(x);if(x.quest_id===protein.id)p.add(d);if(x.quest_id===calories.id)c.add(d)});
  const both=new Set([...p].filter(d=>c.has(d)));
  return{streak:streakFromSet(both),secured:both.has(localDate()),days:both};
}
function streakCard(){
  const kate=memberByKey('Kate'),drew=memberByKey('Drew'),locked=drewLockedData();
  const ks=kate?playerStreak(kate.user_id):0,ds=drew?playerStreak(drew.user_id):0;
  const kdays=new Set(state.completions.filter(c=>!c.reversed_at&&kate&&(c.completed_by===kate.user_id||c.subject_user_id===kate.user_id)).map(qbCompletionDate));
  const ddays=new Set(state.completions.filter(c=>!c.reversed_at&&drew&&(c.completed_by===drew.user_id||c.subject_user_id===drew.user_id)).map(qbCompletionDate));
  const party=streakFromSet(new Set([...kdays].filter(d=>ddays.has(d))));
  return `<section class="card home-card"><p class="eyebrow">🔥 STREAKS</p><div class="streak-grid four"><div><span>Kate</span><b>${ks}</b><small>questing days</small></div><div><span>Drew</span><b>${ds}</b><small>questing days</small></div><div><span>Party</span><b>${party}</b><small>shared days</small></div><div><span>Drew · Locked In</span><b>${locked.streak}</b><small>${locked.secured?'Secured Today':'Protein + Calories'}</small></div></div></section>`;
}

function qbMechanicsText(mechanics){
  const m=safeMeta(mechanics),a=[];
  if(m.defense)a.push(`+${m.defense} Defense`);
  if(m.ward_pct)a.push(`+${m.ward_pct}% Ward`);
  if(m.fortune)a.push(`+${m.fortune} Fortune`);
  if(m.training_xp_pct)a.push(`+${m.training_xp_pct}% Training XP`);
  if(m.exploration_xp_pct)a.push(`+${m.exploration_xp_pct}% Exploration XP`);
  if(m.third_expedition_renown)a.push(`+${m.third_expedition_renown} Renown every 3rd expedition`);
  if(m.gauntlet_xp_pct)a.push(`+${m.gauntlet_xp_pct}% Gauntlet XP`);
  if(m.witcher_trial_xp_pct)a.push(`+${m.witcher_trial_xp_pct}% Witcher Trial XP`);
  if(m.featured_xp_pct)a.push(`+${m.featured_xp_pct}% Featured Random XP`);
  if(m.shared_xp_pct)a.push(`+${m.shared_xp_pct}% Shared / Co-op XP`);
  if(m.category_xp_pct&&typeof m.category_xp_pct==='object')Object.entries(m.category_xp_pct).forEach(([k,v])=>a.push(`+${v}% ${k} XP`));
  if(m.treasury_mitigation)a.push('Blocks one Treasury withdrawal penalty');
  if(m.gauntlet)a.push('Throw one spouse Gauntlet');
  const effect=safeMeta(m.effect);if(effect.kind==='campaignXp'&&effect.pct)a.push(`+${Math.round(effect.pct*100)}% Campaign XP · ${effect.uses||1} uses`);
  if(effect.kind==='streakWard')a.push(`Protects ${effect.uses||1} missed Party streak day`);
  return a.join(' · ');
}

function qbRenderPackItem(i){
  const d=qbItemDef(i),kind=d?.kind||safeMeta(i.metadata).kind,stats=qbItemStats(i),transfer=d?.transferable!==false;
  return `<div class="qb-pack-item"><div><b>${esc(qbItemName(i))}</b><span>${esc(d?.rarity||safeMeta(i.metadata).rarity||i.state)} · ${esc(d?.description||safeMeta(i.metadata).description||'')}</span>${stats?`<strong class="qb-gear-stats">${esc(stats)}</strong>`:''}</div><div class="qb-pack-actions">${kind==='gear'?`<button data-item-action="equip" data-item-id="${i.id}">Equip</button>`:`<button data-item-action="use" data-item-id="${i.id}">${kind==='challenge'?'Use · Throw Gauntlet':'Use Item'}</button>`}${transfer?`<button class="ghost" data-item-action="give" data-item-id="${i.id}">Give</button>`:''}<button class="ghost danger" data-item-action="discard" data-item-id="${i.id}">Discard</button></div></div>`;
}
function qbRenderUnclaimedItem(i){
  const d=qbItemDef(i),stats=qbItemStats(i);
  return `<div class="qb-pack-item qb-unclaimed-item"><div><span class="qb-loot-rarity">${esc(d?.rarity||safeMeta(i.metadata).rarity||'loot')}</span><b>${esc(qbItemName(i))}</b><span>${esc(d?.description||safeMeta(i.metadata).description||'Unclaimed reward')}</span>${stats?`<strong class="qb-gear-stats">${esc(stats)}</strong>`:''}</div><div class="qb-pack-actions"><button data-item-action="claim" data-item-id="${i.id}">Keep</button><button class="ghost danger" data-item-action="discard" data-item-id="${i.id}">Discard</button></div></div>`;
}
function qbLockedInPanel(){
  const drew=memberByKey('Drew');if(!drew)return'';
  const d=drewLockedData(),canBackfill=state.membership.role==='admin'||ownUserId()===drew.user_id;
  const milestones=[3,7,14,30];
  return `<section class="card qb-panel qb-locked-panel"><div class="card-head"><div><p class="eyebrow">🔒 LOCKED IN</p><h2>${d.streak} Day${d.streak===1?'':'s'}</h2></div><span class="count-pill ${d.secured?'good':''}">${d.secured?'Secured Today':'Pending'}</span></div><p>Meet Protein Goal + Meet Calorie Goal on the same day to secure Drew's Locked In streak.</p><div class="qb-locked-milestones">${milestones.map(n=>`<span class="${d.streak>=n?'hit':''}">${n} days</span>`).join('')}</div>${canBackfill?'<button id="qbBackfillLocked" class="ghost">Backfill Yesterday</button>':''}<p class="fine">Backfill is reward-neutral; it repairs yesterday's streak record without granting XP.</p></section>`;
}
function qbEnhanceCharacterParity(){
  const {uid,member}=selectedCharacter(),own=uid===ownUserId(),key=member?.player_key||'Adventurer';
  if(!own&&key!=='Drew')return;
  const items=playerItemsVisible(uid),pack=items.filter(i=>i.state==='pack'),unclaimed=items.filter(i=>i.state==='unclaimed');
  if(own){
    const packPanel=[...screen.querySelectorAll('.qb-panel')].find(x=>/PERSONAL INVENTORY/.test(x.textContent||'')||/🎒 PACK/.test(x.textContent||''));
    if(packPanel){
      packPanel.innerHTML=`<div class="card-head"><div><p class="eyebrow">🎒 PACK</p><h2>Personal Inventory</h2></div><span class="count-pill ${pack.length>=8?'danger':''}">${pack.length} / 8</span></div><div class="qb-pack-list">${pack.map(qbRenderPackItem).join('')||'<div class="empty-inline">Your Pack is empty.</div>'}</div><p class="fine">Pack capacity is 8. Equipped gear does not occupy Pack space.</p>`;
      if(unclaimed.length){
        const loot=document.createElement('section');loot.className='card qb-panel qb-unclaimed-panel';loot.innerHTML=`<div class="card-head"><div><p class="eyebrow">✨ UNCLAIMED LOOT</p><h2>Rewards Awaiting a Decision</h2></div><span class="count-pill">${unclaimed.length}</span></div><div class="qb-pack-list">${unclaimed.map(qbRenderUnclaimedItem).join('')}</div><p class="fine">Unclaimed rewards stay outside the 8-slot Pack until you Keep them.</p>`;
        packPanel.parentElement.insertBefore(loot,packPanel);
      }
    }
  }
  if(key==='Drew'){
    const col=screen.querySelector('.qb-character-column:last-child')||screen.querySelector('.qb-character-columns');
    if(col){const wrap=document.createElement('div');wrap.innerHTML=qbLockedInPanel();const panel=wrap.firstElementChild;if(panel)col.insertBefore(panel,col.firstChild)}
  }
  qbWireCharacterActions();
  document.querySelector('#qbBackfillLocked')?.addEventListener('click',async()=>{if(!confirm("Backfill yesterday as Drew Locked In? This is reward-neutral."))return;const {data,error}=await sb.rpc('backfill_locked_in_yesterday');if(error)return alert(error.message);showToast(`Locked In backfill recorded for ${data?.effective_date||'yesterday'}`);await Promise.all([loadCompletions(),loadActivity()]);renderCharacter()});
}
const qbRenderCharacterBeforeV6=renderCharacter;
renderCharacter=function(){qbRenderCharacterBeforeV6();qbEnhanceCharacterParity()};

function qbWireCharacterActions(){
  screen.querySelectorAll('[data-item-action]').forEach(b=>b.onclick=async()=>{
    const action=b.dataset.itemAction,id=b.dataset.itemId;let r={error:null};b.disabled=true;
    if(action==='equip')r=await sb.rpc('equip_player_item',{p_item_id:id});
    if(action==='unequip')r=await sb.rpc('unequip_player_item',{p_item_id:id});
    if(action==='discard'){if(!confirm('Discard this item?')){b.disabled=false;return}r=await sb.rpc('discard_player_item',{p_item_id:id})}
    if(action==='give'){if(!confirm('Give this item to your spouse?')){b.disabled=false;return}r=await sb.rpc('give_player_item_to_spouse',{p_item_id:id})}
    if(action==='claim')r=await sb.rpc('claim_player_item',{p_item_id:id});
    if(action==='use')r=await sb.rpc('use_player_item',{p_item_id:id});
    if(r.error){b.disabled=false;return alert(r.error.message)}
    showToast(action==='use'?'Item activated.':action==='claim'?'Loot moved to Pack.':'Inventory updated.');
    await Promise.all([loadPlayerItems(),loadGuildItems(),loadPlayers(),loadGauntlets(),loadActivity()]);renderCharacter();
  });
  screen.querySelectorAll('[data-qb-spec]').forEach(b=>b.onclick=async()=>{const {error}=await sb.rpc('choose_specialization',{p_specialization_key:b.dataset.qbSpec});if(error)return alert(error.message);await loadSpecializations();renderCharacter()});
}

async function completeQuest(id,button,source='journal'){
  button.disabled=true;const q=state.quests.find(x=>x.id===id),occurrence=occurrenceKey(q),before=progressByUser(ownUserId())?.level||levelFor(progressByUser(ownUserId())?.personal_xp||0);
  const {data,error}=await sb.rpc('complete_quest',{p_quest_id:id,p_occurrence_key:occurrence,p_source:source});if(error){alert(error.message);button.disabled=false;return}
  const fate=data?.fate?` · Fate: ${data.fate}`:'',cache=data?.campaign_cache_bonus?` · Victory Cache +${data.campaign_cache_bonus} Campaign`:'',counter=Number(data?.count_target||1)>1?` · ${data.count_current}/${data.count_target}`:'';
  showToast(`✓ ${q.title}${counter} · +${data?.personal_xp_each||0} XP · +${data?.campaign_xp||0} Campaign${fate}${cache}`);
  await loadAll();
  const after=progressByUser(ownUserId())?.level||levelFor(progressByUser(ownUserId())?.personal_xp||0),loot=Array.isArray(data?.loot)?data.loot:[];
  renderCampaignStrip();render();
  const mine=loot.filter(x=>!x.user_id||x.user_id===ownUserId());
  if(after>before||mine.length){
    const lootHtml=mine.length?`<div class="qb-loot-reveal">${mine.map(x=>`<div><b>${esc(x.item_name||x.item_key)}</b><span>${esc(x.rarity||'loot')} · waiting in Unclaimed Loot</span></div>`).join('')}</div>`:'';
    qbModal(`<p class="eyebrow">${after>before?'✦ RANK ADVANCEMENT':'🎁 LOOT FOUND'}</p><div class="qb-modal-mark">${after>before?after:'✦'}</div><h2>${after>before?`Level ${after} · ${esc(rankFor(after).name)}`:'Something came off the road with you.'}</h2>${lootHtml}${after>before&&after%5===0?'<p class="qb-reward-note">Milestone level reached — a milestone cache may also be waiting in your Pack.</p>':''}<button data-qb-modal-close>Continue</button>`)
  }
  if(state.campaign?.status==='victory'&&state.tab==='Home')setTimeout(qbMaybeVictoryFanfare,80);
}
