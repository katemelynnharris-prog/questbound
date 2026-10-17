/* Preserve canonical navigation actions; add current-page semantics and overflow cues. */
function qbNavEdgeCues(){
 const nav=document.getElementById('mainNav');if(!nav)return;
 nav.classList.toggle('qb-nav-more-left',nav.scrollLeft>3);
 nav.classList.toggle('qb-nav-more-right',nav.scrollWidth-nav.clientWidth-nav.scrollLeft>3);
}
const qbRenderNavBeforePolish=renderNav;
renderNav=function(){
 const nav=document.getElementById('mainNav'),focused=nav?.contains(document.activeElement)?document.activeElement.dataset.tab:null;qbRenderNavBeforePolish();if(!nav)return;
 nav.setAttribute('aria-label','Main navigation');
 nav.querySelectorAll('button[data-tab]').forEach(b=>{b.type='button';if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 if(!nav.dataset.qbNavWired){
  nav.dataset.qbNavWired='true';nav.addEventListener('scroll',qbNavEdgeCues,{passive:true});
  nav.addEventListener('keydown',e=>{
   const buttons=[...nav.querySelectorAll('button[data-tab]')],i=buttons.indexOf(document.activeElement);if(i<0)return;
   let next;if(e.key==='ArrowRight')next=(i+1)%buttons.length;else if(e.key==='ArrowLeft')next=(i+buttons.length-1)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;
   e.preventDefault();buttons[next].focus();
  });
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(qbNavEdgeCues).observe(nav);
 }
 if(focused)[...nav.querySelectorAll('button[data-tab]')].find(b=>b.dataset.tab===focused)?.focus({preventScroll:true});
 requestAnimationFrame(()=>{
  const active=nav.querySelector('[aria-current="page"]');if(active){
   const n=nav.getBoundingClientRect(),b=active.getBoundingClientRect();
   if(b.left<n.left+20)nav.scrollLeft-=n.left+20-b.left;
   else if(b.right>n.right-20)nav.scrollLeft+=b.right-n.right+20;
  }
  qbNavEdgeCues();
 });
};
window.addEventListener('resize',qbNavEdgeCues,{passive:true});
if(document.fonts?.ready)document.fonts.ready.then(qbNavEdgeCues);
