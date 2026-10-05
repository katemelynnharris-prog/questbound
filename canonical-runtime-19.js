// === Questbound canonical pass 19: harden Character portrait replacement ===

function qbForceCharacterPortraitV19(){
  if(typeof state==='undefined' || state.tab!=='Character') return;
  const hero=document.querySelector('#screen .character-hero');
  if(!hero) return;

  const selected=typeof selectedCharacter==='function'?selectedCharacter():null;
  const text=String(hero.textContent||'');
  const key=String(selected?.member?.player_key||state.membership?.player_key||( /\bDrew\b/i.test(text)?'Drew':'Kate')).trim();
  const drew=/^drew$/i.test(key);
  const target=drew?'./assets/Drew_portrait.png?v=18.10':'./assets/kate_portrait.png?v=18.10';
  const targetName=drew?'Drew portrait':'Kate portrait';

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

  img.removeAttribute('srcset');
  img.removeAttribute('sizes');
  img.setAttribute('src',target);
  img.setAttribute('alt',targetName);
  img.className='qb-profile-character-art';

  hero.querySelectorAll('.character-art img').forEach(other=>{
    if(other!==img) other.remove();
  });
}

if(!window.__qbCharacterPortraitObserverV19){
  window.__qbCharacterPortraitObserverV19=true;
  const observer=new MutationObserver(()=>{
    if(typeof state!=='undefined' && state.tab==='Character') requestAnimationFrame(qbForceCharacterPortraitV19);
  });
  const root=document.querySelector('#screen');
  if(root) observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset','class']});
  document.addEventListener('click',()=>{
    if(typeof state!=='undefined' && state.tab==='Character') setTimeout(qbForceCharacterPortraitV19,0);
  },true);
}

setTimeout(qbForceCharacterPortraitV19,0);
setTimeout(qbForceCharacterPortraitV19,120);
