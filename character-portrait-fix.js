(()=>{
  const screen=document.getElementById('screen');
  if(!screen)return;

  function selectedName(hero){
    const h1=(hero.querySelector('h1')?.textContent||'').trim();
    if(/^Drew$/i.test(h1))return 'Drew';
    if(/^Kate$/i.test(h1))return 'Kate';
    const active=[...hero.querySelectorAll('button,.character-tabs span,.character-switch button')].find(el=>el.classList.contains('active')||el.getAttribute('aria-selected')==='true');
    const t=(active?.textContent||'').trim();
    if(/^Drew$/i.test(t))return 'Drew';
    return 'Kate';
  }

  function applyPortrait(){
    const activeNav=[...document.querySelectorAll('#mainNav button')].find(b=>b.classList.contains('active'));
    if((activeNav?.textContent||'').trim()!=='Character')return;
    const hero=screen.querySelector('.character-hero');
    if(!hero)return;
    const name=selectedName(hero);
    const filename=name==='Drew'?'Drew_portrait.png':'kate_portrait.png';
    const target=`./assets/${filename}?v=19.0`;
    let art=hero.querySelector('.character-art');
    if(!art){
      art=document.createElement('div');
      art.className='character-art';
      hero.prepend(art);
    }
    let img=art.querySelector('img');
    if(!img){img=document.createElement('img');art.replaceChildren(img)}
    const current=img.getAttribute('src')||'';
    if(!current.includes(filename)){
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src=target;
    }
    if(img.alt!==`${name} portrait`)img.alt=`${name} portrait`;
    if(!img.classList.contains('qb-profile-character-art'))img.classList.add('qb-profile-character-art');
    art.querySelectorAll('img').forEach(other=>{if(other!==img)other.remove()});
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(applyPortrait));
  observer.observe(screen,{childList:true,subtree:true,attributes:true,attributeFilter:['src','class','aria-selected']});
  document.addEventListener('click',()=>setTimeout(applyPortrait,0),true);
  window.addEventListener('pageshow',applyPortrait);
  setInterval(applyPortrait,500);
  applyPortrait();
})();
