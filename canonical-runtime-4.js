// Canonical renderer continuation: Treasury setup + usable Guild Vault items.
function qbVaultCard(){
  const items=state.guildItems||[];
  return `<section class="card home-card"><div class="card-head"><div><p class="eyebrow">✦ GUILD VAULT</p><h2>Shared Inventory</h2></div><span class="count-pill">${items.reduce((n,i)=>n+Number(i.quantity||0),0)} shared</span></div><div class="qb-vault-grid">${items.slice(0,9).map(i=>{const d=(state.itemDefs||[]).find(x=>x.key===i.item_key),m=safeMeta(i.metadata),name=m.name||d?.name||i.item_key,desc=m.description||d?.description||'Shared Guild item',stats=qbMechanicsText(d?.mechanics||m.effect||m),safe=i.item_key==='safe-passage',armed=safe&&m.active_effect===true,cache=i.item_key==='campaign-victory-cache',uses=Number(m.effect?.uses||d?.mechanics?.effect?.uses||0);return `<div class="qb-vault-slot"><b>${esc(name)}${Number(i.quantity||1)>1?` ×${i.quantity}`:''}</b><span>${esc(desc)}</span>${stats?`<small>${esc(stats)}</small>`:''}${safe?`<div class="qb-vault-action">${armed?'<strong>✓ Readied for the next Treasury withdrawal</strong>':`<button class="mini" data-guild-item-use="${i.id}">Ready Safe Passage</button>`}</div>`:''}${cache?`<div class="qb-vault-action"><strong>Passive effect · ${uses||3} use${(uses||3)===1?'':'s'} remaining</strong></div>`:''}</div>`}).join('')||'<div class="empty-inline">The Guild Vault is empty.</div>'}</div><p class="fine">Shared consumables and Party effects live here. Personal gear stays in each player’s Pack.</p></section>`;
}

function qbTreasuryCard(){
  const t=state.treasury,tx=state.treasuryTransactions||[];
  if(!t)return `<section class="card home-card qb-treasury-full"><p class="eyebrow">💰 GUILD TREASURY</p><h2>No active fund</h2><p>Start the first savings fund here when you are ready.</p>${state.membership.role==='admin'?'<button id="qbNewFundV4">Start New Fund</button>':''}</section>`;
  const pct=progressPct(t.balance,t.target_amount);
  return `<section class="card home-card qb-treasury-full"><div class="card-head"><div><p class="eyebrow">💰 GUILD TREASURY</p><h2>${esc(t.name)}</h2></div><b>${money(t.balance)} / ${money(t.target_amount)} Gold</b></div><div class="progress"><span style="width:${pct}%"></span></div><div class="milestones">${[25,50,75,100].map(x=>`<span class="${pct>=x?'hit':''}">${x}%</span>`).join('')}</div><div class="qb-treasury-controls"><label>Amount<input id="qbTreasuryAmount" type="number" min="0.01" step="0.01" placeholder="0"></label><button id="qbDeposit">＋ Deposit</button><label>Withdrawal reason<select id="qbWithdrawReason"><option value="EMERGENCY">Emergency</option><option value="INTENDED PURPOSE">Intended Purpose</option><option value="FLAMBOYANT">Flamboyant</option></select></label><button id="qbWithdraw" class="ghost">− Withdraw</button></div><div class="qb-history-list">${tx.map(x=>`<div class="qb-history-row"><b>${esc(x.tx_type)} ${money(x.amount)} Gold</b><span>${esc(x.reason||'')} · balance ${money(x.balance_after)}</span></div>`).join('')||'<div class="empty-inline">No Treasury transactions yet.</div>'}</div>${state.membership.role==='admin'?'<div class="admin-actions"><button id="qbNewFundV4" class="ghost">Start New Fund</button><button id="qbArchiveFund" class="ghost danger">Archive Current Fund</button></div>':''}</section>`;
}

const qbWireGuildActionsV3=qbWireGuildActions;
qbWireGuildActions=function(){
  qbWireGuildActionsV3();
  document.querySelector('#qbNewFundV4')?.addEventListener('click',async()=>{const name=(prompt('New fund name:')||'').trim();if(!name)return;const goal=Number(prompt('Goal amount:','10000'));if(!(goal>0))return;const start=Number(prompt('Starting balance (reward-neutral):','0'));if(!Number.isFinite(start)||start<0)return alert('Starting balance must be 0 or greater.');let r=await sb.rpc('admin_new_treasury_fund',{p_name:name,p_goal:goal});if(r.error)return alert(r.error.message);if(start>0){r=await sb.rpc('admin_configure_treasury',{p_name:name,p_goal:goal,p_balance:start});if(r.error)return alert(r.error.message)}await Promise.all([loadTreasury(),loadActivity()]);await loadTreasuryTransactions();renderGuild()});
  screen.querySelectorAll('[data-guild-item-use]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {data,error}=await sb.rpc('use_guild_item',{p_item_id:b.dataset.guildItemUse});if(error){b.disabled=false;return alert(error.message)}showToast(data?.message||'Guild item readied');await Promise.all([loadGuildItems(),loadActivity()]);renderGuild()});
};

const qbRenderAdminV3=renderAdmin;
renderAdmin=function(){
  qbRenderAdminV3();
  if(state.membership.role!=='admin')return;
  const t=state.treasury;
  const section=document.createElement('section');
  section.className='card home-card';
  section.innerHTML=`<p class="eyebrow">💰 TREASURY SETUP</p><h2>Fund Configuration</h2><div class="admin-form"><label>Fund name<input id="qbAdminFundName" value="${esc(t?.name||'')}"></label><label>Goal<input id="qbAdminFundGoal" type="number" min="1" value="${Number(t?.target_amount||10000)}"></label><label>Starting / corrected balance<input id="qbAdminFundBalance" type="number" min="0" step="0.01" value="${Number(t?.balance||0)}"></label><label>High-water mark<input disabled value="${Number(t?.high_water||0)}"></label></div><div class="admin-actions"><button id="qbSaveTreasurySetup">Save Treasury Setup</button></div><p class="fine">Starting or corrected balance is reward-neutral and becomes the new high-water mark. Future net-new deposits are what earn Treasury Campaign XP.</p>`;
  const resetCard=[...screen.querySelectorAll('.card')].find(c=>/PLAYTEST RESETS/.test(c.textContent||''));
  if(resetCard)screen.insertBefore(section,resetCard);else screen.appendChild(section);
  document.querySelector('#qbSaveTreasurySetup')?.addEventListener('click',async()=>{const name=document.querySelector('#qbAdminFundName').value.trim(),goal=Number(document.querySelector('#qbAdminFundGoal').value),balance=Number(document.querySelector('#qbAdminFundBalance').value);if(!name||!(goal>0)||balance<0)return alert('Enter a fund name, a positive goal, and a starting balance of 0 or greater.');const {error}=await sb.rpc('admin_configure_treasury',{p_name:name,p_goal:goal,p_balance:balance});if(error)return alert(error.message);showToast('Treasury setup saved');await qbReloadCore()});
};
