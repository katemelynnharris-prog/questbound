/* User-provided Witcher Trials artwork, scoped to the training-page title. */
function qbApplyWitcherLogo(){
 const hero=screen.querySelector('.training-hero.witcher');
 if(!hero||typeof trainingLabel!=='function'||trainingLabel()!=='Witcher Trials'||state.tab!=='Witcher Trials')return;
 const title=hero.querySelector('h1');if(!title||title.querySelector('.qb-witcher-title-image'))return;
 const original=title.textContent,img=document.createElement('img');
 img.className='qb-witcher-title-image';img.src='./assets/witcher-trials-logo.webp?v=52.0';img.alt='Witcher Trials';img.width=2048;img.height=682;img.decoding='async';
 img.onerror=()=>{title.classList.remove('qb-witcher-title');title.textContent=original};
 title.classList.add('qb-witcher-title');title.replaceChildren(img);
}
const qbTrainingBeforeWitcherLogo=renderTraining;
renderTraining=function(){const result=qbTrainingBeforeWitcherLogo();qbApplyWitcherLogo();return result};
const qbRenderBeforeWitcherLogo=render;
render=function(){const result=qbRenderBeforeWitcherLogo();qbApplyWitcherLogo();return result};
