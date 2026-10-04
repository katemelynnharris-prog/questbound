(()=>{
  let bridge=window.__QB_PARITY_SOURCE||'';
  const needle="const blob=new Blob([src],{type:'text/javascript'});";
  if(!bridge.includes(needle)) throw new Error('Questbound canonical injector could not find renderer import marker');
  const injected=`\nconst qbCanonicalParts=['canonical-runtime-1.js','canonical-runtime-2.js','canonical-runtime-3.js','canonical-runtime-4.js','canonical-runtime-5.js','canonical-runtime-6.js','canonical-runtime-7.js','canonical-runtime-8.js','canonical-runtime-9.js','canonical-runtime-10.js','canonical-runtime-11.js'];\nfor(const qbPart of qbCanonicalParts){\n  const qbRes=await fetch(new URL('./'+qbPart,location.href),{cache:'no-store'});\n  if(!qbRes.ok) throw new Error('Unable to load '+qbPart+' ('+qbRes.status+')');\n  src+='\\n'+await qbRes.text();\n}\n`;
  bridge=bridge.replace(needle,injected+needle);
  const moduleTail="const blob=new Blob([src],{type:'text/javascript'});const url=URL.createObjectURL(blob);try{await import(url)}finally{URL.revokeObjectURL(url)}";
  const classicTail="const blob=new Blob([src],{type:'text/javascript'});const url=URL.createObjectURL(blob);try{await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=url;tag.onload=()=>{tag.remove();resolve()};tag.onerror=()=>{tag.remove();reject(new Error('Questbound renderer failed to load'))};document.head.appendChild(tag)})}finally{URL.revokeObjectURL(url)}";
  if(!bridge.includes(moduleTail)) throw new Error('Questbound canonical injector could not replace module renderer tail');
  bridge=bridge.replace(moduleTail,classicTail);
  window.__QB_PARITY_SOURCE=bridge;
})();
