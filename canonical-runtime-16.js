// === Questbound canonical pass 16: interactive Character ability tab ===

function qbWireCharacterAbilityTabV16(){
  if(state.tab!=='Character')return;
  const tabs=[...screen.querySelectorAll('.character-tabs span,.character-tabs button')];
  const abilityTab=tabs.find(x=>String(x.textContent||'').trim()==='Abilities');
  if(!abilityTab)return;
  let button=abilityTab;
  if(abilityTab.tagName!=='BUTTON'){
    button=document.createElement('button');
    button.type='button';
    button.className=abilityTab.className;
    button.textContent='Abilities';
    abilityTab.replaceWith(button);
  }
  button.classList.add('qb-character-tab-button');
  button.onclick=()=>{
    const card=[...screen.querySelectorAll('.card')].find(c=>/ABILITIES/.test(c.querySelector('.eyebrow')?.textContent||''));
    if(!card)return;
    screen.querySelectorAll('.character-tabs .active').forEach(x=>x.classList.remove('active'));
    button.classList.add('active');
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.remove('qb-ability-focus');
    void card.offsetWidth;
    card.classList.add('qb-ability-focus');
    setTimeout(()=>card.classList.remove('qb-ability-focus'),1200);
  };
}

const qbRenderCharacterBeforeV16=renderCharacter;
renderCharacter=function(){
  qbRenderCharacterBeforeV16();
  qbWireCharacterAbilityTabV16();
};
