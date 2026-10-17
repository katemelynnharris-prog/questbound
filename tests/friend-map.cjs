// Run with node; set NODE_PATH to a jsdom installation when needed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
async function check(withLeaflet){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'friends.html'),'utf8'),{runScripts:'outside-only',url:'https://example.test/friends.html',pretendToBeVisual:true});
 const w=dom.window;
 Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return this.id==='friendMap'?640:300}});
 Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return this.id==='friendMap'?360:100}});
 w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:true});
 const requests=[];
 const fixture={available:true,updated_at:new Date().toISOString(),players:[],campaign:null,fate:null,vault:null,quests:[],activity:[],map:{destinations:[{key:'park',name:'A <script>park</script>',area:'Nashville',lat:36.16,lng:-86.78,visited:true,scouted:false},{key:'museum',name:'Museum',area:'Downtown',lat:36.17,lng:-86.79,visited:false,scouted:true}]}};
 w.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>fixture}};w.AbortSignal.timeout=()=>new w.AbortController().signal;
 if(withLeaflet)w.eval(fs.readFileSync(path.join(root,'assets/vendor/leaflet/leaflet.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'friend-map.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'friend-view.js'),'utf8'));
 await new Promise(r=>setTimeout(r,20));
 assert(w.document.querySelector('[data-tab="Map"]'));
 w.document.querySelector('[data-tab="Map"]').click();
 assert.equal(w.document.querySelectorAll('.friend-destination').length,2);
 assert.equal(w.document.querySelectorAll('#view script').length,0);
 if(withLeaflet){
  assert.equal(w.document.querySelectorAll('.friend-map-pin').length,2);
  assert.equal(w.document.querySelectorAll('.friend-map-fog circle').length,2);
  w.document.querySelector('[data-friend-destination="museum"]').click();assert.match(w.document.querySelector('.leaflet-popup-content').textContent,/Museum/);
  w.document.querySelector('#friendMapRecenter').click();
  w.document.querySelector('[data-tab="Camp"]').click();assert.equal(w.document.querySelectorAll('.leaflet-container').length,0);
  w.document.querySelector('[data-tab="Map"]').click();assert.equal(w.document.querySelectorAll('.leaflet-container').length,1);
  w.qbFriendMap.destroy();
  w.document.querySelector('#view').innerHTML=w.qbFriendMap.render({destinations:[]});w.qbFriendMap.mount({destinations:[]});assert.equal(w.document.querySelectorAll('.friend-map-fog circle').length,0);
 }else assert.match(w.document.querySelector('#friendMap').textContent,/could not load/);
 assert.equal(requests.length,1);assert.equal(requests[0].options.credentials,'omit');assert.match(requests[0].url,/questbound_friend_feed$/);
 assert(!w.document.querySelector('[data-local-action]'));w.qbFriendMap.destroy();w.close();
}
(async()=>{await check(true);await check(false);console.log('PASS: Map tab, actual Leaflet markers/fog, escaped labels, navigation cleanup, missing-library fallback, and public-only feed.');})().catch(e=>{console.error(e);process.exit(1)});
