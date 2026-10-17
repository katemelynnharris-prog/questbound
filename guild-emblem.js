/* User-supplied Guild emblem; retain canonical identity editing and page actions. */
function qbApplyGuildEmblem(){
 if(state.tab!=='Guild')return;
 const title=screen.querySelector('.guild-banner h1');if(!title||title.querySelector('.qb-guild-emblem-image'))return;
 const original=title.textContent,img=document.createElement('img');
 img.className='qb-guild-emblem-image';img.src='./assets/guild-emblem.webp?v=53.0';img.alt=String(state.guild?.name||'Jaskier for Congress');img.width=2048;img.height=682;img.decoding='async';
 title.classList.add('qb-guild-emblem-title');title.parentElement?.classList.add('qb-guild-emblem-row');
 img.onerror=()=>{title.classList.remove('qb-guild-emblem-title');title.parentElement?.classList.remove('qb-guild-emblem-row');title.textContent=original};
 title.replaceChildren(img);
}
const qbGuildBeforeEmblem=renderGuild;
renderGuild=function(){const result=qbGuildBeforeEmblem();qbApplyGuildEmblem();return result};
const qbRenderBeforeGuildEmblem=render;
render=function(){const result=qbRenderBeforeGuildEmblem();qbApplyGuildEmblem();return result};
