// === Questbound canonical pass 18: production art asset integration ===

function qbApplyBrandArtV18(){
  const brand=document.querySelector('.brand');
  if(brand&&!brand.querySelector('img.qb-brand-logo')){
    brand.innerHTML='<img class="qb-brand-logo" src="./assets/questbound-logo.png?v=18.2" alt="Questbound">';
  }
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
}

function qbApplyCharacterArtV18(){
  if(state.tab!=='Character')return;
  const {member}=selectedCharacter();
  const key=String(member?.player_key||state.membership?.player_key||'Kate').trim();
  const img=screen.querySelector('.character-art img');
  if(!img)return;
  const drew=/^drew$/i.test(key);
  img.src=drew?'./assets/Drew_portrait.png?v=18.2':'./assets/kate_portrait.png?v=18.2';
  img.alt=`${drew?'Drew':'Kate'} portrait`;
  img.classList.add('qb-profile-character-art');
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
  qbApplyCharacterArtV18();
};
