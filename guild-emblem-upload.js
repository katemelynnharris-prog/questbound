/* Guild artwork is uploaded only after explicit preview/save, into private storage. */
let qbGuildEmblemRecord=null,qbGuildEmblemUrl=null,qbGuildEmblemGid=null;
async function qbLoadGuildEmblem(){
 const gid=state.membership?.guild_id;if(!gid){qbGuildEmblemRecord=null;qbGuildEmblemUrl=null;qbGuildEmblemGid=null;return}
 const {data,error}=await sb.from('guild_emblems').select('guild_id,object_path,updated_at').eq('guild_id',gid).maybeSingle();if(error)throw error;
 let url=null;if(data?.object_path){const signed=await sb.storage.from('guild-emblems').createSignedUrl(data.object_path,3600);if(signed.error)throw signed.error;url=signed.data.signedUrl}
 if(state.membership?.guild_id===gid){qbGuildEmblemGid=gid;qbGuildEmblemRecord=data;qbGuildEmblemUrl=url}
}
const qbLoadGuildBeforeEmblemUpload=loadGuild;
loadGuild=async function(){await qbLoadGuildBeforeEmblemUpload();try{await qbLoadGuildEmblem()}catch(e){console.warn('Guild emblem unavailable',e.message);qbGuildEmblemRecord=null;qbGuildEmblemUrl=null;qbGuildEmblemGid=null}};
function qbEnhanceGuildEmblemUpload(){
 if(state.tab!=='Guild')return;const banner=screen.querySelector('.guild-banner'),row=banner?.querySelector('.qb-guild-name-row');if(!banner)return;
 const old=row?.querySelector('#qbRenameGuild');old?.remove();
 const image=banner.querySelector('.qb-guild-emblem-image');if(image&&qbGuildEmblemGid===state.membership?.guild_id&&qbGuildEmblemUrl){if(image.dataset.savedEmblem!==qbGuildEmblemRecord.object_path){image.dataset.savedEmblem=qbGuildEmblemRecord.object_path;image.src=qbGuildEmblemUrl;image.onerror=()=>{image.removeAttribute('data-saved-emblem');image.onerror=null;image.src='./assets/guild-emblem.webp?v=53.0'}}}
 if(state.membership?.role==='admin'&&!banner.querySelector('#qbChangeGuildEmblem')){
  const actions=document.createElement('div');actions.className='qb-guild-emblem-actions';const button=document.createElement('button');button.id='qbChangeGuildEmblem';button.type='button';button.className='ghost mini';button.textContent='Change Guild Emblem';button.onclick=qbOpenGuildEmblemDialog;actions.appendChild(button);
  (row||banner).insertAdjacentElement('afterend',actions);
  // If the canonical banner lacks a name row, keep the control inside the banner.
  if(!row)banner.appendChild(actions);
 }
}
function qbEnhanceGuildNameAdmin(){
 if(state.tab!=='Guild Admin'||state.membership?.role!=='admin'||screen.querySelector('#qbGuildIdentityAdmin'))return;
 const panel=document.createElement('section');panel.id='qbGuildIdentityAdmin';panel.className='card qb-guild-identity-admin';
 panel.innerHTML='<p class="eyebrow">GUILD IDENTITY</p><h2>Guild name</h2><p class="fine">The name appears in Guild records and accessible labels. The emblem can be changed from the Guild page.</p><button id="qbEditGuildNameAdmin" class="ghost">Edit Guild Name</button>';
 panel.querySelector('button').onclick=async()=>{const current=String(state.guild?.name||''),name=(prompt('Guild name:',current)||'').trim();if(!name||name===current)return;const b=panel.querySelector('button');b.disabled=true;try{const {error}=await sb.rpc('admin_rename_guild',{p_name:name});if(error)throw error;await loadGuild();await loadActivity().catch(()=>{});showToast('Guild name updated.');renderAdmin()}catch(e){alert(e.message);b.disabled=false}};
 screen.appendChild(panel);
}
async function qbPrepareGuildPng(file){
 if(!file||file.size>8388608)throw Error('Choose a PNG smaller than 8 MB.');
 const bytes=new Uint8Array(await file.slice(0,24).arrayBuffer()),signature=[137,80,78,71,13,10,26,10];
 if(bytes.length<24||signature.some((n,i)=>bytes[i]!==n)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw Error('Please choose a valid PNG image.');
 const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20);if(!width||!height||width>8192||height>8192||width*height>30000000)throw Error('Choose an image no larger than 8192 pixels per side and 30 megapixels.');
 const source=URL.createObjectURL(file);
 try{
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This PNG could not be opened.'));image.src=source});
  const scale=Math.min(1,2048/image.naturalWidth,1024/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image preview is unavailable in this browser.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>8388608)throw Error('This PNG is too large after resizing.');return blob;
 }finally{URL.revokeObjectURL(source)}
}
function qbOpenGuildEmblemDialog(){
 if(state.membership?.role!=='admin'||document.querySelector('#qbGuildEmblemModal'))return;
 const gid=state.membership.guild_id,opener=document.activeElement,modal=document.createElement('div');modal.className='qb-modal';modal.id='qbGuildEmblemModal';
 modal.innerHTML='<section class="qb-dialog qb-emblem-dialog" role="dialog" aria-modal="true" aria-labelledby="qbEmblemTitle"><h2 id="qbEmblemTitle">Change Guild Emblem</h2><p class="fine">Choose a PNG up to 8 MB. Transparent backgrounds work best. The image fits without cropping.</p><label class="qb-emblem-file-label">PNG image<input id="qbEmblemFile" type="file" accept="image/png,.png"></label><div class="qb-emblem-preview"><img id="qbEmblemPreview" alt="New guild emblem preview" hidden><p id="qbEmblemPlaceholder" class="fine">Choose an image to preview it here.</p></div><p id="qbEmblemStatus" class="fine" role="status" aria-live="polite"></p><div class="qb-inline-actions qb-emblem-dialog-actions"><button id="qbEmblemSave" disabled>Save Emblem</button><button id="qbEmblemCancel" class="ghost">Cancel</button></div></section>';
 document.body.appendChild(modal);const input=modal.querySelector('input'),preview=modal.querySelector('img'),save=modal.querySelector('#qbEmblemSave'),cancel=modal.querySelector('#qbEmblemCancel'),status=modal.querySelector('#qbEmblemStatus');let blob=null,previewUrl=null,busy=false,generation=0;
 const close=()=>{if(busy)return;generation++;if(previewUrl)URL.revokeObjectURL(previewUrl);modal.remove();document.removeEventListener('keydown',keyboard);if(opener?.isConnected)opener.focus()};
 const keyboard=e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const focus=[...modal.querySelectorAll('input,button')].filter(x=>!x.disabled),first=focus[0],last=focus[focus.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};document.addEventListener('keydown',keyboard);cancel.onclick=close;
 input.onchange=async()=>{const current=++generation;blob=null;save.disabled=true;preview.hidden=true;modal.querySelector('#qbEmblemPlaceholder').hidden=false;status.textContent='Preparing preview…';try{const ready=await qbPrepareGuildPng(input.files[0]);if(current!==generation||!modal.isConnected)return;if(previewUrl)URL.revokeObjectURL(previewUrl);blob=ready;previewUrl=URL.createObjectURL(blob);preview.src=previewUrl;preview.hidden=false;modal.querySelector('#qbEmblemPlaceholder').hidden=true;status.textContent='Preview ready. Nothing changes until you save.';save.disabled=false}catch(e){if(current===generation)status.textContent=e.message}};
 save.onclick=async()=>{
  if(!blob||busy)return;if(state.membership?.guild_id!==gid||state.membership?.role!=='admin'){status.textContent='Your Guild session changed. Close this window and try again.';return}
  busy=true;save.disabled=true;cancel.disabled=true;input.disabled=true;status.textContent='Saving emblem…';const path=gid+'/'+crypto.randomUUID()+'.png',old=qbGuildEmblemGid===gid?qbGuildEmblemRecord?.object_path:null;let uploaded=false,stored=false;
  try{
   const up=await sb.storage.from('guild-emblems').upload(path,blob,{contentType:'image/png',cacheControl:'3600',upsert:false});if(up.error)throw up.error;uploaded=true;
   const {error}=await sb.from('guild_emblems').upsert({guild_id:gid,object_path:path,updated_by:ownUserId(),updated_at:new Date().toISOString()},{onConflict:'guild_id'});if(error)throw error;stored=true;
   await qbLoadGuildEmblem();if(old&&old!==path)await sb.storage.from('guild-emblems').remove([old]).catch(()=>{});
   busy=false;close();if(state.tab==='Guild')renderGuild();showToast('Guild emblem updated.');
  }catch(e){if(uploaded&&!stored)await sb.storage.from('guild-emblems').remove([path]).catch(()=>{});status.textContent=stored?'The emblem was saved, but its preview could not refresh. Close this window and refresh Questbound.':e.message;busy=false;cancel.disabled=false;input.disabled=false;save.disabled=stored}
 };
 input.focus();
}
const qbGuildBeforeUpload=renderGuild;
renderGuild=function(){const result=qbGuildBeforeUpload();qbEnhanceGuildEmblemUpload();return result};
const qbAdminBeforeGuildIdentity=renderAdmin;
renderAdmin=function(){const result=qbAdminBeforeGuildIdentity();qbEnhanceGuildNameAdmin();return result};
const qbRenderBeforeEmblemUpload=render;
render=function(){const result=qbRenderBeforeEmblemUpload();qbEnhanceGuildEmblemUpload();qbEnhanceGuildNameAdmin();return result};
setInterval(()=>{if(state.membership&&document.visibilityState==='visible')qbLoadGuildEmblem().then(()=>{if(state.tab==='Guild')qbEnhanceGuildEmblemUpload()}).catch(()=>{})},30*60*1000);
