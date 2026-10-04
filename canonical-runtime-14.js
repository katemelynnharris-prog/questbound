// === Questbound canonical pass 14: explicit Gauntlet ownership ===

function gauntletCard(){
  const gs=state.gauntlets||[],me=ownUserId();
  return `<section class="card home-card"><p class="eyebrow">🥊 ACTIVE GAUNTLETS</p><h2>${gs.length?`${gs.length} encounter${gs.length===1?'':'s'} live`:'No challenge is on the board.'}</h2><div class="watch-list">${gs.map(g=>{
    const mine=g.target_user_id===me,target=mine?'You':qbMemberName(g.target_user_id),giver=g.created_by&&g.created_by!==g.target_user_id?qbMemberName(g.created_by):null;
    return `<div class="watch-row" data-gauntlet-id="${g.id}" data-gauntlet-target="${g.target_user_id||''}"><div><b>${esc(g.objective||questById(g.quest_id)?.title||'Gauntlet')}</b><span><strong>${mine?'YOUR GAUNTLET':`FOR ${String(target||'OTHER PLAYER').toUpperCase()}`}</strong> · ${fmt(g.reward_personal_xp)} Personal XP · ${g.reroll_used?'Reroll used':'One target reroll available'}${giver?` · Thrown by ${esc(giver)}`:''}</span></div><span class="status-chip">${mine?'Yours':esc(target||g.status)}</span></div>`;
  }).join('')||'<div class="empty-inline">Gauntlet encounters will appear here for both Guild members, clearly labeled with who must complete them.</div>'}</div><p class="fine">Both Guild members can see active Gauntlets for shared awareness. Only the named target can complete or reroll a Gauntlet.</p></section>`;
}
