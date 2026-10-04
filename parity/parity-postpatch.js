(()=>{
  let src=window.__QB_PARITY_SOURCE||'';
  const replacements=[
    [
`function localDate(d=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:currentTimeZone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const o=Object.fromEntries(parts.map(p=>[p.type,p.value])); return \`${'${o.year}'}-${'${o.month}'}-${'${o.day}'}\`;
}`,
`function localDate(d=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:currentTimeZone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const base=new Date(\`${'${o.year}'}-${'${o.month}'}-${'${o.day}'}T12:00:00Z\`);
  base.setUTCDate(base.getUTCDate()+Number(state.guild?.playtest_day_offset||0));
  return base.toISOString().slice(0,10);
}`
    ],
    [
`function localPrettyDate(){ return new Intl.DateTimeFormat('en-US',{timeZone:currentTimeZone(),weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date()); }`,
`function localPrettyDate(){ return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(localDate()+'T12:00:00Z')); }`
    ],
    [
`select('id,quest_id,completed_by,subject_user_id,occurrence_key,source,completed_at,campaign_xp_awarded,modifiers,reversed_at')`,
`select('id,quest_id,completed_by,subject_user_id,occurrence_key,source,completed_at,effective_date,campaign_xp_awarded,modifiers,reversed_at')`
    ],
    [
`const set=new Set(state.completions.filter(c=>!c.reversed_at && (c.completed_by===uid || c.subject_user_id===uid)).map(c=>localDate(new Date(c.completed_at))));`,
`const set=new Set(state.completions.filter(c=>!c.reversed_at && (c.completed_by===uid || c.subject_user_id===uid)).map(c=>c.effective_date||localDate(new Date(c.completed_at))));`
    ],
    [
`const d=localDate(new Date(x.completed_at)); if(x.quest_id===protein.id)p.add(d); if(x.quest_id===calories.id)c.add(d);`,
`const d=x.effective_date||localDate(new Date(x.completed_at)); if(x.quest_id===protein.id)p.add(d); if(x.quest_id===calories.id)c.add(d);`
    ]
  ];
  for(const [from,to] of replacements){
    if(src.includes(from)) src=src.replace(from,to); else console.warn('Questbound parity postpatch did not find expected source fragment.');
  }
  window.__QB_PARITY_SOURCE=src;
})();
