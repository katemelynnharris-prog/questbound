// === Questbound canonical pass 17: trim Guild + explicit Ability Ledger ===

const QB_ABILITY_LEDGER_V17={
  initiate:{kind:'Core unlock',effect:'Unlocks the Quest Journal, quest completion tracking, Personal XP, Campaign XP, and Guild activity history.',bonus:'No numeric buff — this is the base Questbound ruleset.'},
  cadet:{kind:'Weekly active',effect:'Once per week, Second Wind can be used on one fitness quest.',bonus:'That quest earns 2× its base Personal XP.'},
  crawler:{kind:'Progression passive',effect:'Level-up rewards can include bonus challenge loot.',bonus:'Loot access improves; there is no fixed percentage modifier shown in the current rules.'},
  rider:{kind:'Build unlock',effect:'Unlocks your personal specialization choice.',bonus:'Your chosen specialization supplies its own bonuses; Signet itself does not add a flat stat.'},
  pathfinder:{kind:'Recovery passive',effect:'Quiet periods can build a Rested benefit instead of being treated as failure.',bonus:'Recovery utility rather than a permanent stat increase; no fixed numeric modifier is currently configured.'},
  witcher:{kind:'Quest active',effect:'Lets you turn one especially dreaded task into a Witcher’s Contract.',bonus:'The Contract becomes a higher-stakes special objective; its reward is defined by the Contract when created.'},
  champion:{kind:'Co-op passive',effect:'Rally rewards completing co-op objectives together.',bonus:'Party/co-op utility; there is not currently a flat universal percentage attached to Rally.'},
  wingleader:{kind:'Category passive',effect:'Lets you favor a quest category so it can receive featured progression treatment.',bonus:'Category-focused progression bonus; the exact bonus is determined by the featured system rather than a permanent stat.'},
  grandmaster:{kind:'Upgrade unlock',effect:'Lets you improve one ability you unlocked earlier.',bonus:'The bonus depends on which earlier ability receives the Masterwork upgrade.'},
  commander:{kind:'Capacity passive',effect:'Expands how much active work your character can carry at once.',bonus:'+1 active quest slot.'},
  ascendant:{kind:'Fate passive',effect:'Improves your odds of seeing rarer Fate outcomes.',bonus:'Rare Fate weighting increases; the current UI does not expose a fixed percentage.'},
  legend:{kind:'Endgame unlock',effect:'Unlocks Prestige and legacy-style endgame progression.',bonus:'No single stat buff — this opens the post-cap progression system.'}
};

function qbAbilityLedgerEntryV17(r){
  const d=QB_ABILITY_LEDGER_V17[r.key]||{kind:'Ability',effect:abilityDescription(r.key),bonus:'No additional modifier listed.'};
  return `<article class="qb-ability-ledger-entry">
    <div class="qb-ability-ledger-head"><h3>${esc(r.ability)}</h3><span>${esc(d.kind)}</span></div>
    <p><b>What it does:</b> ${esc(d.effect)}</p>
    <p><b>Game effect:</b> ${esc(d.bonus)}</p>
    <small>Unlocked at Level ${r.min} · ${esc(r.name)}</small>
  </article>`;
}

function qbEnhanceCharacterAbilitiesV17(){
  if(state.tab!=='Character')return;
  const {progress}=selectedCharacter();
  const xp=Number(progress?.personal_xp||0),level=Number(progress?.level||levelFor(xp));
  const card=[...screen.querySelectorAll('.card')].find(c=>/ABILIT/.test(c.querySelector('.eyebrow')?.textContent||''));
  if(!card)return;
  const unlocked=RANKS.filter(r=>level>=Number(r.min));
  card.classList.add('qb-ability-ledger-v17');
  card.innerHTML=`<p class="eyebrow">✦ ABILITY LEDGER</p><h2>Your Unlocked Abilities</h2><p class="fine">These are the actual gameplay meanings of the abilities you currently have. Numeric buffs are shown when the rules define one.</p><div class="qb-ability-ledger-list">${unlocked.map(qbAbilityLedgerEntryV17).join('')}</div>`;
}

const qbRenderCharacterBeforeV17=renderCharacter;
renderCharacter=function(){
  qbRenderCharacterBeforeV17();
  qbEnhanceCharacterAbilitiesV17();
};

const qbRenderGuildBeforeV17=renderGuild;
renderGuild=function(){
  qbRenderGuildBeforeV17();
  // Remove the redundant informational Guild Paths / Specializations panel.
  const paths=[...screen.querySelectorAll('.card')].find(c=>/SPECIALIZATIONS/i.test(c.querySelector('.eyebrow')?.textContent||'')||/Guild Paths/i.test(c.textContent||''));
  if(paths){
    const parent=paths.parentElement;
    paths.remove();
    if(parent?.classList.contains('home-two')&&parent.children.length===1)parent.classList.add('qb-single-card-row');
  }
};
