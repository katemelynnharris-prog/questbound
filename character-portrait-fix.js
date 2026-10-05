(()=>{
  const screen=document.getElementById('screen');
  if(!screen)return;

  function replaceLiveSprite(img){
    if(!(img instanceof HTMLImageElement))return;
    const alt=String(img.getAttribute('alt')||'').trim();
    let name=null;
    if(/^Kate sprite$/i.test(alt))name='Kate';
    else if(/^Drew sprite$/i.test(alt))name='Drew';
    else return;

    const filename=name==='Drew'?'Drew_portrait.png':'kate_portrait.png';
    const target=`./assets/${filename}?v=19.2`;
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    if((img.getAttribute('src')||'')!==target)img.setAttribute('src',target);
    img.setAttribute('alt',`${name} portrait`);
    img.classList.add('qb-profile-character-art');
  }

  function applyPortraits(root=screen){
    if(root instanceof HTMLImageElement)replaceLiveSprite(root);
    root.querySelectorAll?.('img[alt="Kate sprite"],img[alt="Drew sprite"]').forEach(replaceLiveSprite);
  }

  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes'){
        replaceLiveSprite(record.target);
      }else{
        record.addedNodes.forEach(node=>{
          if(node.nodeType===1)applyPortraits(node);
        });
      }
    }
  });

  observer.observe(screen,{childList:true,subtree:true,attributes:true,attributeFilter:['src','alt','srcset']});
  document.addEventListener('click',()=>setTimeout(()=>applyPortraits(),0),true);
  window.addEventListener('pageshow',()=>applyPortraits());
  setInterval(()=>applyPortraits(),750);
  applyPortraits();
})();
