(()=>{
  let bridge=window.__QB_PARITY_SOURCE||'';
  const needle="const blob=new Blob([src],{type:'text/javascript'});";
  if(!bridge.includes(needle)) throw new Error('Questbound canonical injector could not find renderer import marker');
  const injected=`\nconst qbCanonicalParts=['canonical-runtime-1.js','canonical-runtime-2.js','canonical-runtime-3.js'];\nfor(const qbPart of qbCanonicalParts){\n  const qbRes=await fetch(new URL('./'+qbPart,location.href),{cache:'no-store'});\n  if(!qbRes.ok) throw new Error('Unable to load '+qbPart+' ('+qbRes.status+')');\n  src+='\\n'+await qbRes.text();\n}\n`;
  bridge=bridge.replace(needle,injected+needle);
  window.__QB_PARITY_SOURCE=bridge;
})();
