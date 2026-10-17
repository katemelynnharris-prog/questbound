// Trusted official sources only. Never evaluate page scripts or follow third-party URLs.
export const SOURCES=[
 {id:'humanities',url:'https://www.humanitiestennessee.org/events/',api:'https://www.humanitiestennessee.org/wp-json/tribe/events/v1/events?per_page=30',category:'books',area:'Nashville',lat:36.172,lng:-86.787},
 {id:'frist',url:'https://fristartmuseum.org/all-events/',category:'culture',area:'Downtown · Frist',lat:36.158,lng:-86.783,address:'919 Broadway, Nashville, TN'},
 {id:'parnassus',url:'https://parnassusbooks.net/events',category:'books',area:'Green Hills',lat:36.109,lng:-86.816,address:'3900 Hillsboro Pike, Nashville, TN'},
 {id:'belcourt',url:'https://www.belcourt.org/',category:'movies',area:'Hillsboro Village',lat:36.138,lng:-86.805,address:'2102 Belcourt Avenue, Nashville, TN'},
 {id:'experience',url:'https://experiencecc.com/event-location/murfreesboro-campus/',category:'community',area:'Murfreesboro · Experience Community',lat:35.839,lng:-86.394,address:'521 Old Salem Road, Murfreesboro, TN'},
 {id:'gamepoint',url:'https://gamepointcafe.com/events/',category:'games',area:'East Nashville',lat:36.177,lng:-86.749,address:'107 South 11th Street, Nashville, TN'}
];
export function plain(s){return String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&ndash;/g,'–').replace(/&mdash;/g,'—').replace(/&rsquo;|&lsquo;/g,"'").replace(/&amp;/g,'&').replace(/&#0*39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;|&#160;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(+n,0x10ffff))).replace(/\s+/g,' ').trim()}
export function chicagoDate(value){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}
export function chicagoTime(y,m,d,h=0,min=0){
 const base=Date.UTC(y,m-1,d,h,min),parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',timeZoneName:'longOffset'}).formatToParts(new Date(base));
 const off=parts.find(p=>p.type==='timeZoneName').value.match(/GMT([+-])(\d+):(\d+)/);const minutes=off?(+off[2]*60 + +off[3])*(off[1]==='-'?-1:1):0;
 return new Date(base-minutes*60000).toISOString();
}
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
export function htmlDates(html){
 // Require an explicit year and time. No guessed annual dates or inferred recurrence.
 const t=plain(html),m=t.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})[,\s]+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*[–—-]?\s*(?:(\d{1,2})(?::(\d{2}))?\s*)?(a\.?m\.?|p\.?m\.?)/i);
 if(!m)return null;
 const mer=(m[6]||m[9]).toLowerCase(),hour=(+m[4]%12)+(mer[0]==='p'?12:0),start=chicagoTime(+m[3],MONTHS.indexOf(m[1].toLowerCase())+1,+m[2],hour,+(m[5]||0));
 const end=m[7]?chicagoTime(+m[3],MONTHS.indexOf(m[1].toLowerCase())+1,+m[2],(+m[7]%12)+(m[9].toLowerCase()[0]==='p'?12:0),+(m[8]||0)):null;
 return {start,end};
}
export function ldEvents(html){
 const out=[];function walk(v){if(!v||typeof v!=='object')return;if((Array.isArray(v['@type'])?v['@type']:[v['@type']]).some(t=>/Event$/.test(t||'')))out.push(v);if(Array.isArray(v))v.forEach(walk);else for(const k of ['@graph','itemListElement','item','subEvent'])if(v[k])walk(v[k]);}
 for(const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]))}catch{}}
 return out;
}
export function officialUrl(raw,source){try{const u=new URL(raw,source.url);return u.protocol==='https:'&&u.hostname.replace(/^www\./,'')===new URL(source.url).hostname.replace(/^www\./,'')?u.href:null}catch{return null}}
export function pageLinks(html,source){const out=[];for(const m of html.matchAll(/href=["']([^"']+)["']/gi)){const u=officialUrl(m[1],source);if(u&&/\/(?:event|events|films)\/[^/?#]+/.test(new URL(u).pathname)&&!/[?#]/.test(u))out.push(u)}return [...new Set(out)].slice(0,12)}
// Match event subjects, not the identity of an author, performer, or attendee.
export function excludedEventTheme(title,categories=[],description=''){
 const topic=plain(title+' '+(Array.isArray(categories)?categories:[categories]).map(c=>typeof c==='string'?c:c.name||'').join(' '));
 return /\b(?:lgbtq?\w*|queer|drag (?:queen|king|brunch|show)|pride (?:festival|celebration|parade|night|party))\b/i.test(topic)
 || /\b(?:lgbtq?\w*|queer)[- ]themed\b|celebrat(?:e|ing) (?:lgbtq?\w*|queer|pride)\b/i.test(plain(description))
 || /\bmagic[: ]+(?:the gathering|monday)|\bmtg\b|\bcommander (?:night|tournament|event|league)|\b(?:draft|sealed) (?:magic|mtg)\b/i.test(topic);
}
export async function normalize(raw,source,now=new Date()){
 const title=plain(raw.name||raw.title).slice(0,150),desc=plain(raw.description),start=new Date(raw.startDate||raw.start_date),end=new Date(raw.endDate||raw.end_date||raw.startDate||raw.start_date),url=officialUrl(raw.url,source);
 if(excludedEventTheme(title,raw.categories||[],desc))return null;
 if(!title||!url||!Number.isFinite(+start)||!Number.isFinite(+end)||end<start||end-start>7*864e5||end<now||start>+now+45*864e5)return null;
 if(/cancelled|canceled|postponed|sold out|members.only|homeschool|storytime|teen fest|country music|honky.tonk|30s and 40s|ages? 30/i.test(title+' '+desc))return null;
 const loc=raw.location||raw.venue||{},addr=loc.address||{},address=typeof addr==='string'?addr:[addr.streetAddress,addr.addressLocality,addr.addressRegion].filter(Boolean).join(', ');
 const localText=plain(address+' '+(loc.name||loc.venue||'')+' '+(loc.city||''));
 if(source.id==='humanities'&&!/nashville|bicentennial|tennessee state museum/i.test(localText+' '+title))return null;
 if(/\b(Clarksville|Knoxville|Memphis|Chattanooga|Alabama|Kentucky)\b/i.test(localText))return null;
 if(/\bBroadway\b/i.test(address)&&source.id!=='frist')return null;
 const lat=Number(loc.geo?.latitude||loc.geo_lat||source.lat),lng=Number(loc.geo?.longitude||loc.geo_lng||source.lng);
 if(lat<35.8||lat>36.5||lng< -87.2||lng> -86.3)return null;
 if(source.id==='experience'&&/woodbury|cannon county|shelbyville|tullahoma|mcminnville/i.test(localText))return null;
 const dnd=/dungeons? (?:&|and) dragons?|\bd&d\b|\bdnd\b/i.test(title+' '+desc);
 if(dnd&&/experienced players only|advanced players only|veteran players only/i.test(title+' '+desc))return null;
 let category=source.category;if(source.id==='frist'&&/music|performance|café/i.test(title))category='music';
 // Music preferences: no paid/unknown-cost or unspecified country offerings.
 const offers=Array.isArray(raw.offers)?raw.offers:[raw.offers].filter(Boolean),cost=raw.cost;
 const free=raw.isAccessibleForFree===true || (cost!==undefined&&/^(free|\$?0(?:\.00)?)$/i.test(String(cost).trim())) || (offers.length>0&&offers.every(o=>o.price!==undefined&&Number(o.price)===0)) || /\bfree(?:;|\s*\(|\s*admission|\s*event|\s*concert|\s*performance)|free tour/i.test(raw.costText||'');
 if(category==='music'&&!free)return null;
 const idInput=url.replace(/\/$/,'')+'|'+chicagoDate(start),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(idInput)),key='event-'+[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16);
 const tags=['event',category==='movies'?'indoor':'culture'];if(free)tags.push('budget10','budget30');
 return {key,data:{key,event_key:key,name:title,area:source.area,lat,lng,address:address||source.address||loc.venue||source.area+', Nashville, TN',tags,source_url:url,requires_purchase:!free,cost_label:free?'Free admission':'Check tickets / price',event_starts_at:start.toISOString(),event_ends_at:end.toISOString(),event_category:category,verified_on:now.toISOString().slice(0,10),pin_accuracy:'approximate_area',note:'Check the official event page for tickets, current times, and any changes. Purchases are optional for free admission. '+(category==='music'?'Alcohol is optional. ':'')+(dnd?'D&D outing: confirm new-player availability and any character preparation or registration before leaving. ':''),collector_source:source.id,dnd_beginner_friendly:dnd&&/beginner|new players|no experience|learn to play|introduct/i.test(title+' '+desc)}};
}
export function filmScreenings(h,url,now=new Date()){
 const text=plain(h),name=plain(h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),runtime=+(text.match(/(\d{2,3}) min\./)?.[1]||0),modified=h.match(/"dateModified"\s*:\s*"(20\d{2}[^" ]*)"/);
 if(!name||runtime<40||runtime>300||!modified||Math.abs(+now-new Date(modified[1]).getTime())>90*864e5)return [];
 const section=text.split('Showtimes')[1]?.split('Visit')[0]||'',out=[],year=+chicagoDate(now).slice(0,4);
 const re=/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) ([\s\S]*?)(?=(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) |$)/g;
 for(const m of section.matchAll(re))for(const t of m[4].matchAll(/(\d{1,2}):(\d{2})(am|pm)(?! \(SOLD OUT\))/gi)){
  const month=MONTHS.findIndex(x=>x.startsWith(m[2].toLowerCase()))+1,hour=(+t[1]%12)+(t[3].toLowerCase()==='pm'?12:0);
  for(const y of [year,year+1]){const start=chicagoTime(y,month,+m[3],hour,+t[2]),dt=new Date(start);
   if(dt<now||dt>+now+45*864e5||new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'America/Chicago'}).format(dt)!==m[1])continue;
   out.push({name:'Belcourt: '+name,url,startDate:start,endDate:new Date(+dt+runtime*60000).toISOString(),description:'Screening end is based on the published runtime. Confirm showtimes and availability.'});break;
  }
 }
 return out;
}
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Questbound-local-events/1.0'}});if(!r.ok)throw Error('HTTP '+r.status);const text=await r.text();if(text.length>2500000)throw Error('Source too large');return text}
export async function collect(source,now=new Date()){
 let raw=[],html='',errors=[];
 if(source.api){try{const j=JSON.parse(await get(source.api));raw.push(...(j.events||[]).map(e=>({...e,name:e.title,startDate:e.start_date_details?e.utc_start_date+'Z':e.start_date,endDate:e.end_date_details?e.utc_end_date+'Z':e.end_date,location:e.venue})));}catch(e){errors.push(e.message)}}
 try{html=await get(source.url);raw.push(...ldEvents(html));}catch(e){errors.push(e.message)}
 if(html){for(const url of pageLinks(html,source)){
  try{const h=await get(url),ld=ldEvents(h);if(source.id==='belcourt')raw.push(...filmScreenings(h,url,now));if(ld.length)raw.push(...ld.map(e=>({...e,url:e.url||url})));
   else{const h1=h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i),dates=htmlDates(h);if(h1&&dates?.end){const t=plain(h);const free=/\bFree\b/i.test(t.slice(t.indexOf(plain(h1[1])),t.indexOf(plain(h1[1]))+600));raw.push({name:h1[1],url,startDate:dates.start,endDate:dates.end,cost:free?'Free':undefined,description:''})}}
  }catch(e){errors.push(e.message)}
 }}
 const items=(await Promise.all(raw.map(r=>normalize(r,source,now)))).filter(Boolean);return {items:[...new Map(items.map(x=>[x.key,x])).values()].sort((a,b)=>Number(b.data.dnd_beginner_friendly)-Number(a.data.dnd_beginner_friendly)||a.data.event_starts_at.localeCompare(b.data.event_starts_at)).slice(0,8),status:html||raw.length?'ok':'unavailable',errors:errors.slice(0,2)};
}
