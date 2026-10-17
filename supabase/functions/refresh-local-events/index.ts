import {collect,SOURCES} from './collector.mjs';
const cors={'Access-Control-Allow-Origin':'https://katemelynnharris-prog.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function db(path:string,method='GET',body?:unknown){const r=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('Catalog storage failed');const t=await r.text();return t?JSON.parse(t):null;}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 const respond=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method!=='POST')return respond({error:'POST required'},405);
 // Gateway verifies JWT. This endpoint only refreshes fixed public event sources;
 // no caller-provided URLs, rewards, database queries, or personal data are accepted.
 try{
  const lease=await db('rpc/local_event_refresh_lease','POST',{});if(!lease)return respond({cached:true});
  const results=await Promise.all(SOURCES.map(async s=>({source:s.id,...await collect(s)})));
  const items=results.flatMap(r=>r.items),ok=results.some(r=>r.status==='ok');
  // Preserve manually verified entries and their exact end times/cost notes.
  const current=await db('local_map_destinations?select=key,data&data->>event_key=not.is.null');
  const manual=new Set((current||[]).filter((x:any)=>x.data.curated).map((x:any)=>x.key));
  const incoming=items.filter(x=>!manual.has(x.key));
  if(incoming.length)await db('local_map_destinations?on_conflict=key','POST',incoming);
  await db('local_event_refresh?id=eq.1','PATCH',{checked_at:ok?new Date().toISOString():null,status:ok?'ok':'unavailable',source_results:results.map(r=>({source:r.source,status:r.status,count:r.items.length,errors:r.errors}))});
  return respond({updated:incoming.length,status:ok?'ok':'unavailable'});
 }catch{await db('local_event_refresh?id=eq.1','PATCH',{status:'unavailable'}).catch(()=>{});return respond({error:'Event sources temporarily unavailable'},503)}
});
