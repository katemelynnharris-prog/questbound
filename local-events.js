/* Dated, optional co-op events. Attendance is verified and rewarded by the server. */
let qbEventBusy=false,qbEventRefreshBusy=false,qbEventRefreshAttempt=0;
const qbEventDate=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const qbEventTime=v=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v));
function qbEvents({live=false,free=false,recent=false}={}){
 if(state.localMapGuild!==state.membership?.guild_id)return [];
 const now=Date.now();return (state.localMap?.events||[]).filter(e=>!e.cancelled&&new Date(e.event_ends_at).getTime()+(recent?72*3600000:0)>=now&&(!live||new Date(e.event_starts_at)<=now)&&(!free||!e.requires_purchase));
}
function qbEventClaim(e){return (state.localMap?.event_claims||[]).find(c=>c.event_key===e.event_key)}
function qbEventCard(e,compact=false){
 const now=Date.now(),started=new Date(e.event_starts_at)<=now,ended=new Date(e.event_ends_at)<now,claimed=qbEventClaim(e);
 return `<article class="qb-event-card ${compact?'compact':''}"><p class="eyebrow">${ended?'RECENT OUTING':started?'HAPPENING NOW':'COMING UP'} · ${esc(e.event_category)}</p><h3>${esc(e.name)}</h3><p class="qb-event-when">${esc(qbEventTime(e.event_starts_at))} – ${esc(qbEventTime(e.event_ends_at))} · Central</p><p>${esc(e.area)} · <b>${esc(e.cost_label||'Check price')}</b></p>${compact?'':`<p class="fine">${esc(e.note||'Check the official listing before leaving.')}</p>`}<div class="quest-meta">+100 base Personal XP each · +25 Campaign XP · +4 Renown</div><div class="qb-inline-actions"><a class="qb-local-link" href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">Event details ↗</a>${claimed?'<span class="status-chip">✓ Attended together</span>':started?`<button data-attend-event="${esc(e.event_key)}">We attended · Claim XP</button>`:'<span class="fine">Attendance opens when the event starts.</span>'}</div></article>`;
}
function qbEventPanel({free=false}={}){
 const events=qbEvents({free}),recent=qbEvents({free,recent:true}).filter(e=>new Date(e.event_ends_at)<Date.now()&&!qbEventClaim(e));
 const refresh=state.localMap?.event_refresh,failed=refresh?.status==='unavailable'||refresh?.source_results?.some(s=>s.status==='unavailable');
 const firstByCategory=new Map();for(const e of events)if(!firstByCategory.has(e.event_category))firstByCategory.set(e.event_category,e);const featured=[...firstByCategory.values(),...events.filter(e=>!new Set([...firstByCategory.values()].map(x=>x.key)).has(e.key))];
 return `<section class="card qb-event-panel"><p class="eyebrow">✦ AROUND THE REALM</p><h2>Local happenings</h2><p class="fine">Books, films, beginner-friendly D&D, games, free live music, festivals, culture, and community events. Optional co-op outings; check tickets and traffic before leaving.</p><p class="fine"><a href="https://experiencecc.com/event-location/murfreesboro-campus/" target="_blank" rel="noopener noreferrer">Experience Community · Murfreesboro calendar ↗</a></p><div class="qb-event-list">${featured.slice(0,6).map(e=>qbEventCard(e)).join('')||'<p>No matching upcoming events are verified right now.</p>'}</div>${featured.length>6?`<details><summary>More upcoming events · ${featured.length-6}</summary><p class="fine"><a href="https://experiencecc.com/event-location/murfreesboro-campus/" target="_blank" rel="noopener noreferrer">Experience Community · Murfreesboro calendar ↗</a></p><div class="qb-event-list">${featured.slice(6).map(e=>qbEventCard(e,true)).join('')}</div></details>`:''}${recent.length?`<details><summary>Recently ended · record an outing you attended</summary>${recent.map(e=>qbEventCard(e,true)).join('')}<p class="fine">Attendance can be recorded for 72 hours after an event ends. Only claim if you attended during the event.</p></details>`:''}<p class="fine">${failed?'Some event sources are temporarily unavailable. Saved verified listings remain visible.':refresh?.checked_at?'Event sources checked '+esc(qbEventTime(refresh.checked_at))+'.':'Curated listings verified October 17, 2026.'} New listings are checked weekly when the app is opened; event sites may change or omit listings.</p></section>`;
}
async function qbAttendEvent(key){
 if(qbEventBusy)return;const e=(state.localMap?.events||[]).find(x=>x.event_key===key);if(!e)return;
 if(!confirm('Confirm you both attended '+e.name+' during the event? Attendance XP is awarded once for the party.'))return;
 qbEventBusy=true;screen.querySelectorAll('[data-attend-event]').forEach(b=>b.disabled=true);
 try{const {data,error}=await sb.rpc('attend_local_event',{p_event_key:key,p_free:state.tab==='Map'&&qbLocalOptions.free});if(error)throw error;
  await Promise.all([qbLoadLocalMap(),loadExpeditions(),loadExploration(),loadPlayers(),loadCampaigns(),loadActivity()]);renderCampaignStrip();render();showToast(data?.already_complete?'Attendance already claimed · shared progress refreshed.':'Event explored together · XP awarded to both adventurers. Optional bonus is on the map.');
 }catch(e){alert(e.message);render()}finally{qbEventBusy=false}
}
function qbWireEvents(){screen.querySelectorAll('[data-attend-event]').forEach(b=>b.onclick=()=>qbAttendEvent(b.dataset.attendEvent))}
async function qbMaybeRefreshEvents(){
 if(qbEventRefreshBusy||Date.now()-qbEventRefreshAttempt<6*3600000||!state.membership)return;
 const f=state.localMap?.event_refresh,age=Date.now()-new Date(f?.attempted_at||0).getTime();if(age<(f?.status==='ok'?6*86400000:6*3600000))return;
 qbEventRefreshBusy=true;qbEventRefreshAttempt=Date.now();
 try{const {error}=await sb.functions.invoke('refresh-local-events',{body:{}});if(error)throw error;await qbLoadLocalMap();if(['Home','Calendar','Map'].includes(state.tab)&&!document.querySelector('.qb-modal'))render()}catch(e){console.warn('Local events refresh unavailable',e.message)}finally{qbEventRefreshBusy=false}
}
const qbLoadBeforeEvents=loadAll;
loadAll=async function(){await qbLoadBeforeEvents();try{await qbLoadLocalMap();void qbMaybeRefreshEvents()}catch(e){console.warn('Local events unavailable',e.message)}};
const qbMapBeforeEvents=renderMap;
renderMap=function(){qbMapBeforeEvents();if(!state.localMap)return;screen.querySelector('.qb-local-catalog')?.insertAdjacentHTML('beforebegin',qbEventPanel({free:qbLocalOptions.free}));qbWireEvents();const free=screen.querySelector('#qbLocalFree');if(free)free.onchange=e=>{qbLocalOptions.free=e.target.checked;renderMap()}};
const qbRandomBeforeEvents=randomCard;
randomCard=function(){const events=qbEvents({live:true}).filter(e=>!qbEventClaim(e));return qbRandomBeforeEvents()+ (events.length?`<section class="card qb-event-panel"><p class="eyebrow">✦ LIMITED-TIME SIDEQUEST</p>${qbEventCard(events[0],true)}<p class="fine">Optional extra outing · does not replace your normal sidequest roll. More events are on the calendar and map.</p></section>`:'')};
const qbHomeBeforeEvents=renderHome;
renderHome=function(){qbHomeBeforeEvents();qbWireEvents()};
const qbCalendarBeforeEvents=renderCalendar;
renderCalendar=function(){
 qbCalendarBeforeEvents();const cells=[...screen.querySelectorAll('.qb-cal-cell:not(.blank)')],month=localDate().slice(0,7);
 for(const e of qbEvents()){
  const from=qbEventDate(e.event_starts_at),to=qbEventDate(e.event_ends_at);
  for(const cell of cells){const day=Number(cell.querySelector('b')?.textContent),date=month+'-'+String(day).padStart(2,'0');if(date>=from&&date<=to){const a=document.createElement('a');a.className='qb-cal-local-event';a.href=e.source_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='✦ '+e.name;cell.appendChild(a)}}
 }
 screen.insertAdjacentHTML('beforeend',qbEventPanel());qbWireEvents();
};
