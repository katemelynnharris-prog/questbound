// === Questbound canonical pass 15: global campaign strip placement + Guild identity editing ===

function qbEnhanceGuildIdentityV15(){
  if(state.tab!=='Guild')return;
  const banner=screen.querySelector('.guild-banner');
  if(!banner)return;
  const heading=banner.querySelector('h1');
  if(!heading)return;
  // Always render the persisted Guild name here; never fall back to the player-pair label.
  heading.textContent=String(state.guild?.name||'Questbound');
  let row=banner.querySelector('.qb-guild-name-row');
  if(!row){
    row=document.createElement('div');
    row.className='qb-guild-name-row';
    heading.replaceWith(row);
    row.appendChild(heading);
  }
  if(state.membership?.role==='admin'&&!row.querySelector('#qbRenameGuild')){
    const b=document.createElement('button');
    b.id='qbRenameGuild';
    b.className='mini ghost';
    b.textContent='Edit Guild Name';
    row.appendChild(b);
    b.onclick=async()=>{
      const current=String(state.guild?.name||'').trim();
      const name=(prompt('Guild name:',current)||'').trim();
      if(!name||name===current)return;
      b.disabled=true;
      const {data,error}=await sb.rpc('admin_rename_guild',{p_name:name});
      if(error){b.disabled=false;return alert(error.message)}
      await loadGuild();
      await loadActivity().catch(()=>{});
      showToast(`Guild renamed to ${state.guild.name}`);
      renderGuild();
    };
  }
}

const qbRenderGuildBeforeV15=renderGuild;
renderGuild=function(){
  qbRenderGuildBeforeV15();
  // The mini campaign strip is already globally visible on non-Home tabs,
  // so Guild does not need a second full Campaign panel.
  screen.querySelector('.campaign-home')?.remove();
  qbEnhanceGuildIdentityV15();
};
