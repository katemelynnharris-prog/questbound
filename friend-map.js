(()=>{
 'use strict';
 const center=[36.1627,-86.7816];
 let map=null,view=null;
 const esc=(x='')=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const destinations=data=>(data?.destinations||[]).filter(d=>Number.isFinite(Number(d.lat))&&Number.isFinite(Number(d.lng))&&Number(d.lat)>=35.8&&Number(d.lat)<=36.5&&Number(d.lng)>=-87.2&&Number(d.lng)<=-86.3);
 const status=d=>d.visited?'Visited together':d.scouted?'Scouted':'Unexplored';
 function destroy(){if(map){view={center:map.getCenter(),zoom:map.getZoom()};map.remove();map=null;}}
 function render(data){
  const ds=destinations(data),visited=ds.filter(d=>d.visited).length;
  return `<section class="panel"><p class="eyebrow">THE SHARED WORLD</p><h1>Beyond the familiar</h1><p>Discoveries across Nashville and the surrounding towns. Each completed adventure clears a little more of the fog.</p><p class="friend-map-progress"><b>${visited} / ${ds.length}</b> destinations visited together</p><div class="row"><span class="muted">Nashville &amp; Middle Tennessee</span><button class="ghost" id="friendMapRecenter">Recenter map</button></div><div id="friendMap" class="friend-map" role="region" aria-label="Shared exploration map of Nashville and nearby towns"></div><div class="friend-map-legend"><span>✦ Visited</span><span>◇ Scouted</span><span>? Unexplored</span></div><p class="muted">A view-only map of destination discoveries. Pins show approximate areas.</p></section><section class="panel"><details><summary>Destination journal · ${ds.length} places</summary><div class="friend-destinations">${ds.map(d=>`<article class="friend-destination"><h3>${esc(d.name)}</h3><p>${esc(d.area)}</p><span class="status ${d.visited?'done':''}">${status(d)}</span><button class="ghost" data-friend-destination="${esc(d.key)}">Show on map</button></article>`).join('')}</div></details></section>`;
 }
 function mount(data){
  const el=document.querySelector('#friendMap');if(!el)return;
  const L=window.L,ds=destinations(data);
  if(!L){el.innerHTML='<p class="friend-map-fallback">The interactive map could not load. The destination journal below is still available.</p>';document.querySelector('#friendMapRecenter').disabled=true;document.querySelectorAll('[data-friend-destination]').forEach(b=>b.hidden=true);return;}
  const m=L.map(el,{scrollWheelZoom:false,minZoom:9,maxZoom:17,maxBounds:[[35.8,-87.2],[36.5,-86.3]],maxBoundsViscosity:.8});map=m;
  m.setView(view?.center||center,view?.zoom||10);
  // Identify the site to the tile provider without disclosing a page path or private data.
  // This per-image policy overrides the page's no-referrer setting only for map tiles.
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',maxZoom:19,updateWhenIdle:true,keepBuffer:1,referrerPolicy:'strict-origin'}).addTo(m);
  let tileWarning=null;tiles.on('tileerror',()=>{if(tileWarning)return;tileWarning=document.createElement('p');tileWarning.className='muted';tileWarning.setAttribute('role','status');tileWarning.textContent='Some map tiles could not load. Destination markers and the journal remain available.';el.after(tileWarning);});
  const clearings=ds.filter(d=>d.visited||d.scouted),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('friend-map-fog');svg.setAttribute('aria-hidden','true');
  svg.innerHTML=`<defs><mask id="friendMapFogMask" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white"/>${clearings.map(()=>'<circle fill="black"/>').join('')}</mask></defs><rect width="100%" height="100%" fill="#08100c" fill-opacity=".82" mask="url(#friendMapFogMask)"/>`;el.append(svg);
  const paint=()=>{const size=m.getSize();svg.setAttribute('width',size.x);svg.setAttribute('height',size.y);const mask=svg.querySelector('mask');for(const [k,v] of Object.entries({x:0,y:0,width:size.x,height:size.y}))mask.setAttribute(k,v);svg.querySelectorAll('circle').forEach((c,i)=>{const d=clearings[i],pt=m.latLngToContainerPoint([d.lat,d.lng]),edge=m.latLngToContainerPoint([Number(d.lat)+650/111320,d.lng]);c.setAttribute('cx',pt.x);c.setAttribute('cy',pt.y);c.setAttribute('r',Math.max(4,Math.abs(pt.y-edge.y)));});};
  m.on('move zoom resize',paint);paint();
  const markers=new Map();
  for(const d of ds){const icon=L.divIcon({className:'friend-map-pin '+(d.visited?'visited':d.scouted?'scouted':''),html:`<span>${d.visited?'✦':d.scouted?'◇':'?'}</span>`,iconSize:[30,30],iconAnchor:[15,15]});const marker=L.marker([d.lat,d.lng],{icon,title:d.name,alt:d.name}).addTo(m).bindPopup(`<b>${esc(d.name)}</b><br>${esc(d.area)}<br>${status(d)}`);markers.set(d.key,marker);}
  document.querySelector('#friendMapRecenter').onclick=()=>m.setView(center,10);
  document.querySelectorAll('[data-friend-destination]').forEach(b=>b.onclick=()=>{const d=ds.find(x=>x.key===b.dataset.friendDestination);if(!d)return;m.setView([d.lat,d.lng],14);markers.get(d.key)?.openPopup();el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});});
  requestAnimationFrame(()=>{if(map===m)m.invalidateSize();});
 }
 window.qbFriendMap={render,mount,destroy};
})();
