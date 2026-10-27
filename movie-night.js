/* Private guild watchlists and alternating turns. */
async function qbLoadMovieNight(){const {data,error}=await sb.rpc('movie_night_state');if(error){state.movieNight=null;throw error}state.movieNight=data}
const qbLoadAllBeforeMovieNight=loadAll;
loadAll=async function(){await qbLoadAllBeforeMovieNight();try{await qbLoadMovieNight()}catch(e){console.warn('Movie Night unavailable',e)}};
function qbMovieName(uid){return state.movieNight?.members?.find(m=>m.user_id===uid)?.name||'Your partner'}
let qbMovieNightOpen=false,qbMovieSaving=false,qbMovieOpenSections=[];
function qbMovieNightCard(){
 const s=state.movieNight;if(!s)return '';
 const own=s.movies.filter(m=>m.owner===ownUserId()),turnName=qbMovieName(s.turn),p=s.pending;
 return `<details class="card home-card qb-movie-night" ${qbMovieNightOpen?'open':''}><summary class="qb-movie-summary"><span><small>🎬 MOVIE NIGHT</small><b>${esc(turnName)}’s turn</b></span><span>${p?'Movie picked':'Alternate turns'}</span></summary><div class="qb-movie-content"><p>Pick from ${esc(turnName)}’s watchlist. The turn passes only when you mark a regular pick watched.</p>${p?`<div class="qb-movie-pick"><p class="eyebrow">${esc(qbMovieName(p.owner))}’S PICK${p.override?' · TONIGHT ONLY':''}</p><h2>${esc(p.title)}</h2><div class="qb-inline-actions"><button data-movie-action="watched">Mark Watched</button><button class="ghost" data-movie-action="reroll">↻ Reroll</button></div><p class="fine">${p.override?`Your regular turn order stays unchanged. ${esc(turnName)} still has the next regular pick.`:'Rerolling stays on this person’s list and keeps their turn.'}</p></div>`:`<button data-movie-action="pick">Pick a Movie</button><p class="fine">${s.movies.some(m=>m.owner===s.turn)?'':'This watchlist is empty—add titles below or use the other list tonight.'}</p>`}<details class="qb-movie-override"><summary>Use a different list tonight</summary><div class="qb-inline-actions">${s.members.map(m=>`<button class="ghost" data-movie-override="${m.user_id}">Use ${esc(m.name)}’s List</button>`).join('')}<button class="ghost" data-movie-action="pick">Return to Regular Turn</button></div><p class="fine">A one-night override never changes whose regular turn comes next.</p></details><details class="qb-movie-lists"><summary>Your Watchlists</summary><form id="qbMovieAddForm"><label for="qbMovieTitles">Add to ${esc(qbMovieName(ownUserId()))}’s list · one title per line</label><textarea id="qbMovieTitles" maxlength="25000" rows="4" placeholder="Movie title\nAnother movie title" required></textarea><button type="submit">Add Movies</button><p class="fine">Paste up to 100 titles at once. Duplicate and already-watched titles are skipped.</p></form><div class="qb-movie-list-columns">${s.members.map(m=>{const movies=s.movies.filter(x=>x.owner===m.user_id);return `<section><h3>${esc(m.name)}’s List · ${movies.length}</h3><ul>${movies.map(x=>`<li><span>${esc(x.title)}</span>${m.user_id===ownUserId()?`<button class="ghost mini" data-movie-remove="${x.id}" aria-label="Remove ${esc(x.title)}">Remove</button>`:''}</li>`).join('')||'<li>No movies added yet.</li>'}</ul></section>`}).join('')}</div></details><details class="qb-movie-history"><summary>Watched Together · ${s.history.length}${s.history.length===100?' recent':''}</summary>${s.history.map(h=>`<div class="qb-movie-history-row"><b>${esc(h.title)}</b><small>${esc(qbMovieName(h.owner_user_id))}’s pick · ${esc(new Intl.DateTimeFormat('en-US',{timeZone:currentTimeZone()}).format(new Date(h.watched_at)))}${h.was_override?' · one-night override':''}</small></div>`).join('')||'<p>Watched movies will appear here and leave the picker.</p>'}</details></div></details>`;
}
async function qbMovieAction(action,extra={}){
 if(qbMovieSaving)return;qbMovieSaving=true;qbMovieOpenSections=[...screen.querySelectorAll('.qb-movie-night details[open]')].map(d=>d.className);document.querySelectorAll('.qb-movie-night button,#qbMovieWatchedConfirm').forEach(b=>b.disabled=true);
 try{
  const {data,error}=await sb.rpc('movie_night_action',{p_action:action,p_version:state.movieNight.version,...extra});if(error)throw error;
  state.movieNight=data;
  if(action==='add'){state.movieNightDraft='';showToast(data.added?`${data.added} movie${data.added===1?'':'s'} added.`:'No new movies added—those titles are already listed or watched.')}
  else if(action==='watched')showToast('Movie marked watched.');
  else if(action==='remove')showToast('Movie removed from your list.');
  document.querySelector('.qb-modal[data-movie-modal]')?.remove();qbMovieNightOpen=true;renderGuild();
 }catch(e){alert(e.message);document.querySelector('.qb-modal[data-movie-modal]')?.remove();await qbLoadMovieNight().catch(()=>{});renderGuild()}finally{qbMovieSaving=false}
}
function qbWireMovieNight(){
 const panel=screen.querySelector('.qb-movie-night');if(!panel)return;
 panel.querySelectorAll('details').forEach(d=>{if(qbMovieOpenSections.includes(d.className))d.open=true});
 panel.addEventListener('toggle',()=>{qbMovieNightOpen=panel.open});
 panel.querySelectorAll('[data-movie-action]').forEach(b=>b.onclick=()=>{
  const a=b.dataset.movieAction;if(a!=='watched')return qbMovieAction(a);
  const p=state.movieNight.pending;if(!p)return;
  qbModal(`<p class="eyebrow">MOVIE NIGHT</p><h2>Watched ${esc(p.title)}?</h2><p>${p.override?'This keeps the regular turn order unchanged.':`This passes the next regular pick to your partner.`}</p><div class="qb-inline-actions"><button id="qbMovieWatchedConfirm">Mark Watched</button><button class="ghost" data-qb-modal-close>Cancel</button></div>`);
  const modal=document.querySelector('.qb-modal');if(modal)modal.dataset.movieModal='true';
  document.querySelector('#qbMovieWatchedConfirm').onclick=()=>qbMovieAction('watched',{p_movie_id:p.id});
 });
 panel.querySelectorAll('[data-movie-override]').forEach(b=>b.onclick=()=>qbMovieAction('pick',{p_owner:b.dataset.movieOverride}));
 panel.querySelectorAll('[data-movie-remove]').forEach(b=>b.onclick=()=>qbMovieAction('remove',{p_movie_id:b.dataset.movieRemove}));
 const text=panel.querySelector('#qbMovieTitles');text.value=state.movieNightDraft||'';text.oninput=()=>{state.movieNightDraft=text.value};
 panel.querySelector('#qbMovieAddForm').onsubmit=e=>{e.preventDefault();if(!text.value.trim())return;qbMovieAction('add',{p_titles:text.value})};
}
const qbGuildBeforeMovieNight=renderGuild;
renderGuild=function(){const result=qbGuildBeforeMovieNight();const card=qbMovieNightCard();if(card){const anchor=screen.querySelector('.home-two');if(anchor)anchor.insertAdjacentHTML('afterend',card);else screen.insertAdjacentHTML('beforeend',card);qbWireMovieNight()}return result};
