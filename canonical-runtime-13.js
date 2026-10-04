// === Questbound canonical pass 13: Character ability details ===

function qbUnlockedAbilityList(level){
  const unlocked=RANKS.filter(r=>Number(level)>=Number(r.min));
  return `<div class="qb-ability-list">${unlocked.map(r=>`<div class="qb-ability-entry"><h3>${esc(r.ability)}</h3><p>${esc(abilityDescription(r.key))}</p><small>Unlocked at Level ${r.min} · ${esc(r.name)}</small></div>`).join('')}</div>`;
}

function qbEnhanceCharacterAbilitiesV13(){
  const {progress}=selectedCharacter();
  const xp=Number(progress?.personal_xp||0),level=Number(progress?.level||levelFor(xp));
  const abilityCard=[...screen.querySelectorAll('.card')].find(c=>/ABILITY/.test(c.querySelector('.eyebrow')?.textContent||''));
  if(!abilityCard)return;
  abilityCard.innerHTML=`<p class="eyebrow">✦ ABILITIES</p><h2>Your Unlocked Abilities</h2>${qbUnlockedAbilityList(level)}`;
}

const qbRenderCharacterBeforeV13=renderCharacter;
renderCharacter=function(){
  qbRenderCharacterBeforeV13();
  qbEnhanceCharacterAbilitiesV13();
};
