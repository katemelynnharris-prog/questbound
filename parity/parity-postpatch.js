(()=>{
  let bridge=window.__QB_PARITY_SOURCE||'';
  const needle="const blob=new Blob([src],{type:'text/javascript'});";
  const fromDate=[
    "function localDate(d=new Date()){",
    "  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:currentTimeZone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);",
    "  const o=Object.fromEntries(parts.map(p=>[p.type,p.value])); return `${o.year}-${o.month}-${o.day}`;",
    "}"
  ].join('\n');
  const toDate=[
    "function localDate(d=new Date()){",
    "  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:currentTimeZone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);",
    "  const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));",
    "  const base=new Date(`${o.year}-${o.month}-${o.day}T12:00:00Z`);",
    "  base.setUTCDate(base.getUTCDate()+Number(state.guild?.playtest_day_offset||0));",
    "  return base.toISOString().slice(0,10);",
    "}"
  ].join('\n');
  const fromPretty="function localPrettyDate(){ return new Intl.DateTimeFormat('en-US',{timeZone:currentTimeZone(),weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date()); }";
  const toPretty="function localPrettyDate(){ return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(localDate()+'T12:00:00Z')); }";
  const injected=[
    "// Production playtest clock: patch the fetched app source after all V24 parity swaps.",
    "mustReplace("+JSON.stringify(fromDate)+","+JSON.stringify(toDate)+");",
    "mustReplace("+JSON.stringify(fromPretty)+","+JSON.stringify(toPretty)+");",
    "src=src.replace(\"select('id,quest_id,completed_by,subject_user_id,occurrence_key,source,completed_at,campaign_xp_awarded,modifiers,reversed_at')\",\"select('id,quest_id,completed_by,subject_user_id,occurrence_key,source,completed_at,effective_date,campaign_xp_awarded,modifiers,reversed_at')\");",
    "src=src.replaceAll(\"map(c=>localDate(new Date(c.completed_at)))\",\"map(c=>c.effective_date||localDate(new Date(c.completed_at)))\");",
    "src=src.replace(\"const d=localDate(new Date(x.completed_at)); if(x.quest_id===protein.id)p.add(d); if(x.quest_id===calories.id)c.add(d);\",\"const d=x.effective_date||localDate(new Date(x.completed_at)); if(x.quest_id===protein.id)p.add(d); if(x.quest_id===calories.id)c.add(d);\");",
    "{ const s=src.indexOf('function renderCharacter(){'); if(s<0) throw new Error('Character renderer not found'); const e=src.indexOf('function ',s+24); const blockEnd=e>0?e:src.length; const block=src.slice(s,blockEnd); const patched=block.replace(/sprite\\s*=\\s*[^;]+;/,\"sprite=key==='Drew'?'./assets/Drew_portrait.png?v=19.1':'./assets/kate_portrait.png?v=19.1';\"); if(patched===block) throw new Error('Character sprite assignment not found'); src=src.slice(0,s)+patched+src.slice(blockEnd); }"
  ].join('\n');
  if(!bridge.includes(needle)) throw new Error('Questbound parity postpatch could not find bridge import marker');
  bridge=bridge.replace(needle,injected+'\n'+needle);
  window.__QB_PARITY_SOURCE=bridge;
})();
