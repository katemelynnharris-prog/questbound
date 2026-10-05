// === Questbound canonical pass 18: production art asset integration ===

function qbApplyBrandArtV18(){
  const brand=document.querySelector('.brand');
  if(brand&&!brand.querySelector('img.qb-brand-logo')){
    brand.innerHTML='<img class="qb-brand-logo" src="./assets/questbound-logo.png?v=18.7" alt="Questbound">';
  }
}

function qbSizeHomeCampaignBackdropV18(){
  if(state.tab!=='Home')return;
  const campaign=screen.querySelector('.campaign-home');
  if(!campaign)return;
  screen.classList.add('qb-home-campaign-backdrop');
  const screenTop=screen.getBoundingClientRect().top;
  const campaignBottom=campaign.getBoundingClientRect().bottom;
  screen.style.setProperty('--qb-campaign-backdrop-height',`${Math.max(1,Math.ceil(campaignBottom-screenTop))}px`);
}

function qbApplyHomeArtV18(){
  if(state.tab!=='Home')return;
  const imgs=[...screen.querySelectorAll('.players-grid img')];
  imgs.forEach(img=>{
    const src=String(img.getAttribute('src')||'').toLowerCase();
    const card=img.closest('.player-card,.card,section,article,div');
    const text=String(card?.textContent||'');
    const isKate=src.includes('kate.svg')||/\bKate\b/i.test(text)||/kate/i.test(img.alt||'');
    const isDrew=src.includes('drew.svg')||/\bDrew\b/i.test(text)||/drew/i.test(img.alt||'');
    if(isKate){img.src='./assets/kate_full.png';img.alt='Kate';img.classList.add('qb-home-character-art')}
    else if(isDrew){img.src='./assets/Drew_full.png';img.alt='Drew';img.classList.add('qb-home-character-art')}
  });
  qbSizeHomeCampaignBackdropV18();
}

function qbApplyCharacterArtV18(){
  if(state.tab!=='Character')return;
  const selected=typeof selectedCharacter==='function'?selectedCharacter():null;
  const key=String(selected?.member?.player_key||state.membership?.player_key||'Kate').trim();
  const drew=/^drew$/i.test(key);
  const src=drew?'./assets/Drew_portrait.png?v=18.7':'./assets/kate_portrait.png?v=18.7';
  const alt=`${drew?'Drew':'Kate'} portrait`;
  const hero=screen.querySelector('.character-hero');
  if(!hero)return;
  let art=hero.querySelector('.character-art');
  if(!art){
    art=document.createElement('div');
    art.className='character-art qb-forced-character-art';
    hero.prepend(art);
  }
  let img=art.querySelector('img');
  if(!img){
    img=document.createElement('img');
    art.replaceChildren(img);
  }
  img.setAttribute('src',src);
  img.setAttribute('alt',alt);
  img.className='qb-profile-character-art';
  [...hero.querySelectorAll('img')].forEach(other=>{
    if(other!==img)other.remove();
  });
}

function qbReassertCharacterArtV18(){
  qbApplyCharacterArtV18();
  setTimeout(qbApplyCharacterArtV18,40);
  setTimeout(qbApplyCharacterArtV18,180);
}

qbApplyBrandArtV18();

const qbRenderHomeBeforeV18=renderHome;
renderHome=function(){
  qbRenderHomeBeforeV18();
  qbApplyBrandArtV18();
  qbApplyHomeArtV18();
};

const qbRenderCharacterBeforeV18=renderCharacter;
renderCharacter=function(){
  qbRenderCharacterBeforeV18();
  qbApplyBrandArtV18();
  qbReassertCharacterArtV18();
};

const qbRenderBeforeArtV18=render;
render=function(){
  if(state.tab!=='Home'){
    screen.classList.remove('qb-home-campaign-backdrop');
    screen.style.removeProperty('--qb-campaign-backdrop-height');
  }
  const out=qbRenderBeforeArtV18();
  if(state.tab==='Character')qbReassertCharacterArtV18();
  return out;
};

if(!window.__qbCampaignBackdropResizeV18){
  window.__qbCampaignBackdropResizeV18=true;
  window.addEventListener('resize',()=>{
    if(state?.tab==='Home')requestAnimationFrame(qbSizeHomeCampaignBackdropV18);
  });
}
