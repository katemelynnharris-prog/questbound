// === Questbound canonical pass 13: Character ability details ===

const QB_ABILITY_DETAIL={
  initiate:{type:'Core unlock',effect:'Guild questing, the Ledger, and basic activity tracking are available.'},
  cadet:{type:'Weekly active',effect:'Second Wind lets you designate one fitness quest each week to receive 2× base Personal XP.'},
  crawler:{type:'Progression passive',effect:'Loot Find allows level-ups to reveal bonus challenge loot.'},
  rider:{type:'Build unlock',effect:'Signet unlocks a personal specialization so your progression can reward the way you actually play.'},
  pathfinder:{type:'Recovery passive',effect:'Rested lets quieter periods prepare a future Rested bonus rather than punishing downtime.'},
  witcher:{type:'Quest active',effect:'Witcher’s Contract lets you elevate one dreaded task into a higher-stakes contract.'},
  champion:{type:'Co-op passive',effect:'Rally enhances the value of completing co-op objectives together.'},
  wingleader:{type:'Category passive',effect:'Commander’s Favor lets you favor a quest category for featured progression bonuses.'},
  grandmaster:{type:'Upgrade unlock',effect:'Masterwork lets you improve one ability you unlocked earlier.'},
  commander:{type:'Capacity passive',effect:'War Council increases your active quest capacity by one slot.'},
  ascendant:{type:'Fate passive',effect:'Legendary Draw makes rare Fate outcomes more likely.'},
  legend:{type:'Endgame unlock',effect:'Prestige opens endgame progression and legacy rewards.'}
};

function qbAbilityDetail(rank){
  const d=QB_ABILITY_DETAIL[rank.key]||{type:'Ability',effect:abilityDescription(rank.key)};
  return {...d,title:rank.ability,rank:rank.name,level:rank.min,summary:abilityDescription(rank.key)};
}
function qbUnlockedAbilityList(level){
  const unlocked=RANKS.filter(r=>Number(level)>=Number(r.min));
  return `<div class="qb-ability-list">${unlocked.map(r=>{const d=qbAbilityDetail(r);return `<button type="button" class="qb-ability-entry" data-qb-ability="${esc(r.key)}"><span class="qb-ability-copy"><strong>${esc(r.ability)}</strong><span>${esc(d.effect)}</span><small>${esc(d.type)} · Unlocked at Level ${r.min} · ${esc(r.name)}</small></span><span class="qb-ability-more" aria-hidden="true">Details ›</span></button>`}).join('')}</div>`;
}
function qbOpenAbilityDetail(key){
  const rank=RANKS.find(r=>r.key===key);if(!rank)return;
  const d=qbAbilityDetail(rank);
  qbModal(`<p class="eyebrow">✦ ${esc(d.type.toUpperCase())}</p><h2>${esc(d.title)}</h2><p>${esc(d.effect)}</p><div class="qb-ability-modal-meta"><b>Unlocked</b><span>Level ${d.level} · ${esc(d.rank)}</span></div><p class="fine">This panel describes the ability’s current Questbound effect. Equipment bonuses and physical Training stats are tracked separately.</p><button data-qb-modal-close>Close</button>`);
}
function qbEnhanceCharacterAbilitiesV13(){
  const {progress}=selectedCharacter();
  const xp=Number(progress?.personal_xp||0),level=Number(progress?.level||levelFor(xp));
  const abilityCard=[...screen.querySelectorAll('.card')].find(c=>/ABILITY/.test(c.querySelector('.eyebrow')?.textContent||''));
  if(!abilityCard)return;
  abilityCard.innerHTML=`<p class="eyebrow">✦ ABILITIES</p><h2>Your Unlocked Abilities</h2><p class="fine">Effects are shown below. Select an ability for its full detail.</p>${qbUnlockedAbilityList(level)}`;
  abilityCard.querySelectorAll('[data-qb-ability]').forEach(b=>b.onclick=()=>qbOpenAbilityDetail(b.dataset.qbAbility));
}

const qbRenderCharacterBeforeV13=renderCharacter;
renderCharacter=function(){
  qbRenderCharacterBeforeV13();
  qbEnhanceCharacterAbilitiesV13();
};
