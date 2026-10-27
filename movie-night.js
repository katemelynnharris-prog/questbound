/* Private guild watchlists and alternating turns. */
let qbMovieLoadPromise=null,qbMovieLoadError='';
async function qbLoadMovieNight(){
 if(qbMovieLoadPromise)return qbMovieLoadPromise;
 qbMovieLoadPromise=(async()=>{const {data,error}=await sb.rpc('movie_night_state');if(error||!data){state.movieNight=null;qbMovieLoadError='Could not load your watchlists.';throw error||Error(qbMovieLoadError)}state.movieNight=data;qbMovieLoadError='';return data})().finally(()=>{qbMovieLoadPromise=null});
 return qbMovieLoadPromise;
}
function qbEnsureMovieNight(){
 if(state.movieNight||qbMovieLoadPromise||qbMovieLoadError)return;
 qbLoadMovieNight().catch(()=>{}).finally(()=>{if(state.tab==='Guild')renderGuild()});
}
const qbLoadAllBeforeMovieNight=loadAll;
loadAll=async function(){await qbLoadAllBeforeMovieNight();try{await qbLoadMovieNight()}catch(e){console.warn('Movie Night unavailable',e)}};
function qbMovieName(uid){return state.movieNight?.members?.find(m=>m.user_id===uid)?.name||'Your partner'}
let qbMovieNightOpen=false,qbMovieSaving=false,qbMovieOpenSections=[];
const qbMovieSeasons=[['anytime','Anytime'],['halloween','Halloween'],['christmas','Christmas'],['thanksgiving','Thanksgiving'],['autumn','Autumn'],['winter','Winter'],['spring','Spring'],['summer','Summer'],['valentine','Valentine’s']];
function qbMovieSeasonOptions(value='anytime'){return qbMovieSeasons.map(([id,name])=>`<option value="${id}" ${value===id?'selected':''}>${name}</option>`).join('')}
function qbShowChecklist(s){const active=(s.shows||[]).filter(x=>!x.finished_at),done=(s.shows||[]).filter(x=>x.finished_at);return `<details class="qb-tv-checklist"><summary>Shows to Finish · ${active.length}</summary><form id="qbShowAddForm"><label for="qbShowTitles">Add shows · one title per line</label><textarea id="qbShowTitles" rows="2" maxlength="25000" placeholder="Show title" required></textarea><button type="submit">Add Shows</button></form><ul class="qb-tv-list">${active.map(x=>`<li><label><input type="checkbox" data-show-finish="${x.id}"><span>${esc(x.title)}</span></label><button class="ghost mini" data-show-remove="${x.id}">Remove</button></li>`).join('')||'<li>No unfinished shows yet.</li>'}</ul><details class="qb-tv-finished"><summary>Finished Shows · ${done.length}</summary>${done.map(x=>`<div class="qb-movie-history-row"><b>✓ ${esc(x.title)}</b><small>${esc(new Intl.DateTimeFormat('en-US',{timeZone:currentTimeZone()}).format(new Date(x.finished_at)))}</small><button class="ghost mini" data-show-reopen="${x.id}">Move Back to Checklist</button></div>`).join('')||'<p>Completed shows will stay here.</p>'}</details></details>`}
function qbMovieNightCard(){
 const s=state.movieNight;if(!s)return `<section class="card qb-movie-night qb-movie-loading"><p class="eyebrow">🎬 MOVIE NIGHT</p><h2>Your Movie Picker</h2><p role="status">${qbMovieLoadError?'Could not load your watchlists.':'Loading your watchlists…'}</p>${qbMovieLoadError?'<button id="qbRetryMovieNight">Try Again</button>':''}</section>`;
 const own=s.movies.filter(m=>m.owner===ownUserId()),turnName=qbMovieName(s.turn),p=s.pending;
 return `<details class="card qb-movie-night" ${qbMovieNightOpen?'open':''}><summary class="qb-movie-summary"><span><small>🎬 MOVIE NIGHT</small><b>${esc(turnName)}’s turn</b></span><span>${p?'Movie picked':'Alternate turns'}</span></summary><div class="qb-movie-content"><p>Pick from ${esc(turnName)}’s watchlist. The turn passes only when you mark a regular pick watched.</p>${p?`<div class="qb-movie-pick"><p class="eyebrow">${esc(qbMovieName(p.owner))}’S PICK${p.override?' · MOVIE PASS':''}${p.seasonal_boost?' · SEASONAL PICK':''}</p><h2>${esc(p.title)}</h2><div class="qb-inline-actions"><button data-movie-action="watched">Mark Watched</button><button class="ghost" data-movie-action="reroll">↻ Reroll</button></div><p class="fine">${p.override?`Your regular turn order stays unchanged. ${esc(turnName)} still has the next regular pick.`:'Rerolling stays on this person’s list and keeps their turn.'}</p></div>`:`<button data-movie-action="pick">Pick a Movie</button><p class="fine">${s.movies.some(m=>m.owner===s.turn)?'':'This watchlist is empty—add titles below or use the other list tonight.'}</p>`}<details class="qb-movie-pass"><summary>Movie Pass · ${s.my_pass_available?'Ready':'Used this month'}</summary><p>One pass each per calendar month, with no rollover. Spend yours to draw from your own list during the other person’s turn. They keep the next regular turn.</p><button class="ghost" data-movie-action="pass" ${!s.my_pass_available||s.turn===ownUserId()||!own.length||p?.override?'disabled':''}>Use My Movie Pass</button><p class="fine">${s.turn===ownUserId()?'It is already your turn. ':''}${!own.length?'Add movies to your list first. ':''}Rerolls are free. A pass is spent when you use it. Refreshes ${esc(s.pass_resets||'next month')}.</p>${p?.override?'<button class="ghost" data-movie-action="pick">Return to Regular Turn</button>':''}</details><details class="qb-movie-lists"><summary>Your Watchlists</summary><form id="qbMovieAddForm"><label for="qbMovieTitles">Add to ${esc(qbMovieName(ownUserId()))}’s list · one title per line</label><textarea id="qbMovieTitles" maxlength="25000" rows="4" placeholder="Movie title\nAnother movie title" required></textarea><label for="qbMovieSeason">Season for these titles</label><select id="qbMovieSeason">${qbMovieSeasonOptions(state.movieNightSeason||'anytime')}</select><button type="submit">Add Movies</button><p class="fine">Paste up to 100 titles at once. Duplicate and already-watched titles are skipped. In-season tags get 3× the draw weight; the person’s turn stays the same.</p></form><div class="qb-movie-list-columns">${s.members.map(m=>{const movies=s.movies.filter(x=>x.owner===m.user_id);return `<section><h3>${esc(m.name)}’s List · ${movies.length}</h3><ul>${movies.map(x=>`<li><span>${esc(x.title)}</span>${m.user_id===ownUserId()?`<div class="qb-movie-row-controls"><select data-movie-season="${x.id}" aria-label="Season for ${esc(x.title)}">${qbMovieSeasonOptions(x.season)}</select><button class="ghost mini" data-movie-remove="${x.id}" aria-label="Remove ${esc(x.title)}">Remove</button></div>`:`<small>${esc(qbMovieSeasons.find(v=>v[0]===x.season)?.[1]||'Anytime')}</small>`}</li>`).join('')||'<li>No movies added yet.</li>'}</ul></section>`}).join('')}</div></details>${qbShowChecklist(s)}<details class="qb-movie-history"><summary>Watched Together · ${s.history.length}${s.history.length===100?' recent':''}</summary>${s.history.map(h=>`<div class="qb-movie-history-row"><b>${esc(h.title)}</b><small>${esc(qbMovieName(h.owner_user_id))}’s pick · ${esc(new Intl.DateTimeFormat('en-US',{timeZone:currentTimeZone()}).format(new Date(h.watched_at)))}${h.was_override?' · one-night override':''}</small></div>`).join('')||'<p>Watched movies will appear here and leave the picker.</p>'}</details></div></details>`;
}
async function qbMovieAction(action,extra={}){
 if(qbMovieSaving)return;qbMovieSaving=true;qbMovieOpenSections=[...screen.querySelectorAll('.qb-movie-night details[open]')].map(d=>d.className);document.querySelectorAll('.qb-movie-night button,#qbMovieWatchedConfirm,#qbMoviePassConfirm').forEach(b=>b.disabled=true);
 try{
  const request=action==='add'?['add_movie_titles',{p_titles:extra.p_titles,p_season:extra.p_season||'anytime'}]:action==='season'?['set_movie_season',{p_movie_id:extra.p_movie_id,p_season:extra.p_season}]:action.startsWith('show-')?['tv_watchlist_action',{p_action:action.slice(5),...extra}]:['movie_night_action',{p_action:action,p_version:state.movieNight.version,...extra}];
  const {data,error}=await sb.rpc(...request);if(error)throw error;
  state.movieNight=data;
  if(action==='add'){state.movieNightDraft='';showToast(data.added?`${data.added} movie${data.added===1?'':'s'} added.`:'No new movies added—those titles are already listed or watched.')}
  else if(action==='watched')showToast('Movie marked watched.');
  else if(action==='show-add'){state.showNightDraft='';showToast('Shows added.')}
  else if(action.startsWith('show-'))showToast('Show checklist updated.');
  else if(action==='pass')showToast('Movie Pass used. Your partner keeps the next regular turn.');
  else if(action==='remove')showToast('Movie removed from your list.');
  document.querySelector('.qb-modal[data-movie-modal]')?.remove();qbMovieNightOpen=true;renderGuild();
 }catch(e){alert(e.message);document.querySelector('.qb-modal[data-movie-modal]')?.remove();await qbLoadMovieNight().catch(()=>{});renderGuild()}finally{qbMovieSaving=false}
}
function qbWireMovieNight(){
 const panel=screen.querySelector('.qb-movie-night');if(!panel)return;
 const retry=panel.querySelector('#qbRetryMovieNight');if(retry){retry.onclick=()=>{qbMovieLoadError='';renderGuild()};return}if(!state.movieNight)return;
 panel.querySelectorAll('details').forEach(d=>{if(qbMovieOpenSections.includes(d.className))d.open=true});
 panel.addEventListener('toggle',()=>{qbMovieNightOpen=panel.open});
 panel.querySelectorAll('[data-movie-action]').forEach(b=>b.onclick=()=>{
  const a=b.dataset.movieAction;
  if(a==='pass'){qbModal(`<p class="eyebrow">MOVIE PASS</p><h2>Use your pass?</h2><p>Draw from your own list tonight. ${esc(qbMovieName(state.movieNight.turn))} keeps the next regular turn. This spends your one pass for the month; rerolls stay free.</p><button id="qbMoviePassConfirm">Use Movie Pass</button><button class="ghost" data-qb-modal-close>Cancel</button>`);const modal=document.querySelector('.qb-modal');if(modal)modal.dataset.movieModal='true';document.querySelector('#qbMoviePassConfirm').onclick=()=>qbMovieAction('pass');return}
  if(a!=='watched')return qbMovieAction(a);
  const p=state.movieNight.pending;if(!p)return;
  qbModal(`<p class="eyebrow">MOVIE NIGHT</p><h2>Watched ${esc(p.title)}?</h2><p>${p.override?'This keeps the regular turn order unchanged.':`This passes the next regular pick to your partner.`}</p><div class="qb-inline-actions"><button id="qbMovieWatchedConfirm">Mark Watched</button><button class="ghost" data-qb-modal-close>Cancel</button></div>`);
  const modal=document.querySelector('.qb-modal');if(modal)modal.dataset.movieModal='true';
  document.querySelector('#qbMovieWatchedConfirm').onclick=()=>qbMovieAction('watched',{p_movie_id:p.id});
 });
 panel.querySelectorAll('[data-movie-season]').forEach(select=>select.onchange=()=>qbMovieAction('season',{p_movie_id:select.dataset.movieSeason,p_season:select.value}));
 panel.querySelectorAll('[data-movie-remove]').forEach(b=>b.onclick=()=>qbMovieAction('remove',{p_movie_id:b.dataset.movieRemove}));
 const text=panel.querySelector('#qbMovieTitles');text.value=state.movieNightDraft||'';text.oninput=()=>{state.movieNightDraft=text.value};
 panel.querySelector('#qbMovieSeason').onchange=e=>{state.movieNightSeason=e.target.value};
 panel.querySelector('#qbShowTitles').value=state.showNightDraft||'';panel.querySelector('#qbShowTitles').oninput=e=>{state.showNightDraft=e.target.value};
 panel.querySelector('#qbShowAddForm').onsubmit=e=>{e.preventDefault();const value=panel.querySelector('#qbShowTitles').value;if(value.trim())qbMovieAction('show-add',{p_titles:value})};
 panel.querySelectorAll('[data-show-finish]').forEach(b=>b.onchange=()=>qbMovieAction('show-finish',{p_show_id:b.dataset.showFinish}));
 panel.querySelectorAll('[data-show-remove]').forEach(b=>b.onclick=()=>qbMovieAction('show-remove',{p_show_id:b.dataset.showRemove}));
 panel.querySelectorAll('[data-show-reopen]').forEach(b=>b.onclick=()=>qbMovieAction('show-reopen',{p_show_id:b.dataset.showReopen}));
 panel.querySelector('#qbMovieAddForm').onsubmit=e=>{e.preventDefault();if(!text.value.trim())return;qbMovieAction('add',{p_titles:text.value,p_season:panel.querySelector('#qbMovieSeason').value})};
}
const qbGuildBeforeMovieNight=renderGuild;
renderGuild=function(){const result=qbGuildBeforeMovieNight();const card=qbMovieNightCard();const anchor=screen.querySelector('.guild-banner');if(anchor)anchor.insertAdjacentHTML('afterend',card);else screen.insertAdjacentHTML('afterbegin',card);qbWireMovieNight();qbEnsureMovieNight();return result};
