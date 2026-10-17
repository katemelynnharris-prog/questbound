/* Real-world adventures. Existing expedition XP, gear and abilities remain canonical. */
let qbLocalLeaflet=null,qbLocalView=null,qbLocalLoading=false,qbLocalBusy=false;
const qbLocalOptions={free:false,setting:'any',polaroid:false,hammock:false};
async function qbLoadLocalMap(){
 const gid=state.membership?.guild_id;
 const {data,error}=await sb.rpc('local_map_state');if(error)throw error;
 if(state.membership?.guild_id===gid){state.localMap=data;state.localMapGuild=gid}
}
function qbLocalDirections(d){return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(d.address||d.name+', Nashville, TN')}
function qbLocalBonusCard(run,exp){
 const b=state.localMap.bonuses.find(x=>x.key===run.bonus_key);if(!b)return '';
 return `<div class="qb-adventure-bonus"><p class="eyebrow">OPTIONAL ADVENTURE BONUS</p><h3>${esc(b.title)}</h3><p>${esc(b.objective)}</p><small>+50 Personal XP · +10 Campaign XP · +1 Renown</small><div class="qb-inline-actions">${run.bonus_completed_at?'<span class="status-chip">✓ Bonus claimed</span>':exp?.status==='complete'&&run.visited_at?`<button data-local-action="bonus" data-exp="${esc(run.expedition_id)}">Claim bonus</button>`:exp?.status==='active'?`<button class="ghost mini" data-local-action="reroll_bonus" data-exp="${esc(run.expedition_id)}" ${run.bonus_rerolled?'disabled':''}>${run.bonus_rerolled?'Reroll used':'Reroll bonus'}</button><small>Complete the visit first. The bonus is optional.</small>`:''}</div></div>`;
}
function renderMap(){
 if(state.localMapGuild!==state.membership?.guild_id)state.localMap=null;
 if(qbLocalLeaflet){qbLocalView={center:qbLocalLeaflet.getCenter(),zoom:qbLocalLeaflet.getZoom()};qbLocalLeaflet.remove();qbLocalLeaflet=null}
 if(!state.localMap){
  screen.innerHTML='<section class="card"><p class="eyebrow">PARTY MAP</p><h1>Charting the local roads…</h1><p id="qbLocalLoadStatus">Loading destinations and shared exploration.</p><button id="qbLocalRetry" class="ghost hidden">Try again</button></section>';
  if(!qbLocalLoading){qbLocalLoading=true;qbLoadLocalMap().then(()=>{if(state.tab==='Map')renderMap()}).catch(e=>{const status=document.querySelector('#qbLocalLoadStatus');if(status)status.textContent=e.message;const retry=document.querySelector('#qbLocalRetry');if(retry){retry.classList.remove('hidden');retry.onclick=()=>renderMap()}}).finally(()=>{qbLocalLoading=false})}return;
 }
 const m=state.localMap,ex=state.exploration||{},dests=m.destinations||[],runs=m.runs||[],visited=new Set(runs.filter(r=>r.visited_at).map(r=>r.destination_key)),active=(state.expeditions||[]).find(e=>e.status==='active'),run=runs.find(r=>r.expedition_id===active?.id),dest=dests.find(d=>d.key===run?.destination_key);
 const pending=runs.filter(r=>r.visited_at&&!r.bonus_completed_at);
 screen.innerHTML=`<section class="ledger-head"><p class="eyebrow">🗺 YOUR SHARED WORLD</p><h1>Beyond Home Territory</h1><p>Explore Nashville together. A completed visit clears the fog for both of you.</p></section>
 <div class="qb-map-layout qb-local-layout"><section class="card qb-local-map-card"><div class="qb-local-map-top"><span>⌂ 37211 · approximate home region</span><button id="qbLocalHome" class="mini ghost">Recenter</button></div><div id="qbRealMap" class="qb-real-map" aria-label="Nashville exploration map"></div><div class="qb-local-legend"><span>⌂ Home</span><span>✦ Visited</span><span>? Unexplored</span></div><p class="fine">Pins show approximate areas. Directions use the named destination. Aim for a 30–40-minute drive; check current traffic before leaving.</p></section>
 <aside class="qb-map-side"><section class="card"><p class="eyebrow">${esc(ex.exploration_rank||'Home Territory')}</p><h2>${fmt(ex.renown||0)} Renown</h2><p>${visited.size} / ${dests.length} destinations visited</p><p class="fine">Your previous expedition history and Renown are preserved. Old unnamed discoveries stay in history until linked to an actual visit.</p></section>
 <section class="card"><p class="eyebrow">PLAN YOUR NEXT ADVENTURE</p><div class="qb-local-filters"><label class="qb-local-check"><input id="qbLocalFree" type="checkbox" ${qbLocalOptions.free?'checked':''}> Free outing (parking excluded)</label><label>Setting<select id="qbLocalSetting"><option value="any">Any setting</option><option value="indoor" ${qbLocalOptions.setting==='indoor'?'selected':''}>Indoors</option><option value="outdoor" ${qbLocalOptions.setting==='outdoor'?'selected':''}>Outdoors / neighborhood walk</option></select></label><label class="qb-local-check"><input id="qbLocalPolaroid" type="checkbox" ${qbLocalOptions.polaroid?'checked':''}> Bringing a Polaroid camera</label><label class="qb-local-check"><input id="qbLocalHammock" type="checkbox" ${qbLocalOptions.hammock?'checked':''}> Bringing a freestanding hammock; a permitted spot is confirmed</label><p class="fine">Filters apply to your next draw. Purchases and ticketed venues are excluded from free outings.</p></div>
 ${active?`<div class="qb-local-destination"><h2>${esc(dest?.name||active.title)}</h2>${dest?`<p class="eyebrow">${esc(dest.area)}</p>`:''}<p>${esc(active.objective)}</p>${dest?.note?`<p class="qb-local-note">${esc(dest.note)}</p>`:''}<div class="quest-meta">+${fmt(active.xp_personal)} Personal XP · +${fmt(active.xp_campaign)} Campaign XP · +${fmt(active.renown_reward)} Renown</div><p class="fine">Visit and bonus XP go to the player who claims each reward; destination discovery is shared.</p><div class="qb-inline-actions">${run?`<a class="qb-local-link" href="${esc(qbLocalDirections(dest))}" target="_blank" rel="noopener noreferrer">Directions ↗</a><button data-local-action="complete" data-exp="${esc(active.id)}">Visited · Complete</button><button class="ghost" data-local-action="skip" data-exp="${esc(active.id)}">Not today · New destination</button>`:`<button data-local-action="draw">Find a real destination</button><button class="ghost" id="qbLegacyComplete">Complete existing expedition</button>`}</div>${run?qbLocalBonusCard(run,active):'<p class="fine">Attach a destination to this existing expedition, keeping its current rewards.</p>'}</div>`:'<button data-local-action="draw">Draw an expedition</button>'}</section></aside></div>
 ${pending.length?`<section class="card"><p class="eyebrow">RECENT ADVENTURE BONUSES</p><p>Claim only challenges you completed during their outing.</p><div class="qb-local-pending">${pending.map(r=>`<div><h3>${esc(dests.find(d=>d.key===r.destination_key)?.name||'Adventure')}</h3>${qbLocalBonusCard(r,{status:'complete'})}</div>`).join('')}</div></section>`:''}
 <details class="card qb-local-catalog"><summary>Explore the destination list · ${dests.length} places</summary><div class="qb-local-destination-list">${dests.map(d=>`<button class="ghost" data-map-dest="${esc(d.key)}"><b>${visited.has(d.key)?'✓ ':''}${esc(d.name)}</b><small>${esc(d.area)} · ${d.requires_purchase?'Paid outing':'Free exploration available'}</small></button>`).join('')}</div></details>
 <section class="card"><p class="eyebrow">EXPEDITION HISTORY</p><div class="qb-history-list">${(state.expeditions||[]).filter(e=>e.status==='complete').slice(0,8).map(e=>`<div class="qb-history-row"><b>${esc(e.title)}</b><span>${esc(fmtDate(e.completed_at))} · +${fmt(e.renown_reward)} base Renown</span></div>`).join('')||'<p>Your next adventure starts here.</p>'}</div></section>`;
 document.querySelector('#qbLocalFree').onchange=e=>qbLocalOptions.free=e.target.checked;
 document.querySelector('#qbLocalSetting').onchange=e=>qbLocalOptions.setting=e.target.value;
 document.querySelector('#qbLocalPolaroid').onchange=e=>qbLocalOptions.polaroid=e.target.checked;
 document.querySelector('#qbLocalHammock').onchange=e=>qbLocalOptions.hammock=e.target.checked;
 screen.querySelectorAll('[data-local-action]').forEach(b=>b.onclick=()=>qbLocalAction(b.dataset.localAction,b.dataset.exp));
 document.querySelector('#qbLegacyComplete')?.addEventListener('click',()=>qbCompleteExpedition(active));
 qbMountLocalMap(dests,runs,m.home,run?.destination_key);
}
async function qbLocalAction(action,id){
 if(qbLocalBusy)return;
 if(action==='complete'&&!confirm('Confirm you visited this destination? This marks it explored for both of you.'))return;
 if(action==='bonus'&&!confirm('Confirm you completed this bonus during the outing? It can be claimed once for the party.'))return;
 if(action==='skip'&&!confirm('Set this destination aside and draw another using your selected filters?'))return;
 qbLocalBusy=true;screen.querySelectorAll('[data-local-action]').forEach(b=>b.disabled=true);
 try{
  const before=progressByUser(ownUserId())?.level||1;
  const {data,error}=await sb.rpc('local_expedition_action',{p_action:action,p_expedition_id:id||null,p_free:qbLocalOptions.free,p_setting:qbLocalOptions.setting,p_equipment:[...(qbLocalOptions.polaroid?['polaroid']:[]),...(qbLocalOptions.hammock?['hammock']:[])]});if(error)throw error;
  await Promise.all([qbLoadLocalMap(),loadExpeditions(),loadExploration(),loadPlayers(),loadCampaigns(),loadActivity()]);
  renderCampaignStrip();if(state.tab==='Map')renderMap();
  if(data?.already_complete)showToast('Already claimed · shared progress refreshed.');else if(action==='complete'||action==='bonus')showToast(`${action==='bonus'?'Adventure bonus':'Destination explored'} · +${data.personal_xp||0} XP · +${data.renown||0} Renown`);else showToast(action==='reroll_bonus'?'New adventure bonus rolled.':'Your next adventure is ready.');
  const after=progressByUser(ownUserId())?.level||1;if(after>before)qbLevelFanfare(after);
 }catch(e){alert(e.message);if(state.tab==='Map')renderMap()}finally{qbLocalBusy=false}
}
function qbMountLocalMap(dests,runs,home,activeKey){
 const container=document.querySelector('#qbRealMap');
 if(!window.L){container.innerHTML='<p class="qb-local-map-fallback">The map tiles could not load. You can still draw and complete expeditions, use Directions, or refresh to retry.</p>';return}
 const L=window.L,visited=new Set(runs.filter(r=>r.visited_at).map(r=>r.destination_key));
 const map=L.map(container,{scrollWheelZoom:false,minZoom:10,maxZoom:17,maxBounds:[[35.8,-87.2],[36.5,-86.3]],maxBoundsViscosity:.8});qbLocalLeaflet=map;
 map.setView(qbLocalView?.center||[home.lat,home.lng],qbLocalView?.zoom||11);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',maxZoom:19,updateWhenIdle:true,keepBuffer:1}).addTo(map);
 const clearings=[{lat:home.lat,lng:home.lng,radius:900}];
 for(const key of new Set([...visited,...runs.map(r=>r.scouted_destination_key).filter(Boolean)])){const d=dests.find(x=>x.key===key);if(d)clearings.push({...d,radius:650})}
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('qb-local-fog');svg.setAttribute('aria-hidden','true');
 // SVG mask unions circular openings: overlapping explored areas stay clear.
 const maskId='qbFogMask';svg.innerHTML=`<defs><mask id="${maskId}" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white"/>${clearings.map(()=>'<circle fill="black"/>').join('')}</mask></defs><rect width="100%" height="100%" fill="#08100c" fill-opacity=".9" mask="url(#${maskId})"/>`;
 container.appendChild(svg);
 const paintFog=()=>{const size=map.getSize();svg.setAttribute('width',size.x);svg.setAttribute('height',size.y);const mask=svg.querySelector('mask');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width',size.x);mask.setAttribute('height',size.y);svg.querySelectorAll('circle').forEach((c,i)=>{const a=clearings[i],pt=map.latLngToContainerPoint([a.lat,a.lng]),edge=map.latLngToContainerPoint([a.lat+a.radius/111320,a.lng]);c.setAttribute('cx',pt.x);c.setAttribute('cy',pt.y);c.setAttribute('r',Math.max(4,Math.abs(pt.y-edge.y)))})};
 map.on('move zoom resize',paintFog);paintFog();
 const markers=new Map();
 const icon=(text,cls)=>L.divIcon({className:'qb-local-pin '+cls,html:`<span>${text}</span>`,iconSize:[30,30],iconAnchor:[15,15]});
 L.marker([home.lat,home.lng],{icon:icon('⌂','home'),title:home.label}).addTo(map).bindPopup('Home region · 37211<br>Approximate ZIP center, not a home address.');
 for(const d of dests){const marker=L.marker([d.lat,d.lng],{icon:icon(visited.has(d.key)?'✦':d.key===activeKey?'!':'?',visited.has(d.key)?'visited':d.key===activeKey?'active':''),title:d.name}).addTo(map).bindPopup(`<b>${esc(d.name)}</b><br>${esc(d.area)}<br>${visited.has(d.key)?'Visited together':'Unexplored destination'}<br><a href="${esc(qbLocalDirections(d))}" target="_blank" rel="noopener noreferrer">Directions ↗</a><br><a href="${esc(d.source_url)}" target="_blank" rel="noopener noreferrer">Visitor information ↗</a>${d.note?'<p>'+esc(d.note)+'</p>':''}`);markers.set(d.key,marker)}
 document.querySelector('#qbLocalHome').onclick=()=>map.setView([home.lat,home.lng],12);
 screen.querySelectorAll('[data-map-dest]').forEach(b=>b.onclick=()=>{const d=dests.find(x=>x.key===b.dataset.mapDest);map.setView([d.lat,d.lng],14);markers.get(d.key)?.openPopup();container.scrollIntoView({behavior:'smooth',block:'center'})});
 requestAnimationFrame(()=>{if(qbLocalLeaflet===map)map.invalidateSize()});
}
let qbLocalPollBusy=false;
setInterval(async()=>{
 if(state.tab!=='Map'||document.hidden||!state.membership||!state.localMap||qbLocalBusy||qbLocalPollBusy||document.querySelector('.qb-modal'))return;
 qbLocalPollBusy=true;
 try{const before=JSON.stringify([state.localMap,state.expeditions,state.exploration]);await Promise.all([qbLoadLocalMap(),loadExpeditions(),loadExploration()]);if(before!==JSON.stringify([state.localMap,state.expeditions,state.exploration])&&state.tab==='Map')renderMap()}catch(e){console.warn('Unable to refresh exploration',e)}finally{qbLocalPollBusy=false}
},30000);
