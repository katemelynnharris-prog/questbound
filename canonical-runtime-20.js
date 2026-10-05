// === Questbound canonical pass 20: Rider's Quadrant visual scoping only ===
// Adds visual hook classes and visual title replacement only. No behavior, state, data, navigation, or calculations are changed.

function qbApplyRidersQuadrantVisualV20(){
  const isRiders=typeof trainingLabel==='function' && trainingLabel()==="Rider's Quadrant" && state.tab==="Rider's Quadrant";
  screen.classList.toggle('qb-riders-quadrant',isRiders);
  screen.querySelectorAll('.qb-riders-frame').forEach(el=>el.classList.remove('qb-riders-frame'));
  screen.querySelectorAll('.qb-riders-title-text').forEach(el=>el.classList.remove('qb-riders-title-text'));
  screen.querySelectorAll('.qb-riders-title-image').forEach(el=>{if(!isRiders)el.remove()});
  if(!isRiders)return;

  const hero=screen.querySelector('.training-hero') || screen.querySelector('.card');
  if(hero)hero.classList.add('qb-riders-frame');
  if(!hero)return;

  const title=[...hero.querySelectorAll('h1,h2')].find(el=>String(el.textContent||'').trim()==="Rider's Quadrant") || hero.querySelector('h1');
  if(!title)return;
  title.classList.add('qb-riders-title-text');

  let img=hero.querySelector('.qb-riders-title-image');
  if(!img){
    img=document.createElement('img');
    img.className='qb-riders-title-image';
    img.alt="Rider's Quadrant";
    img.src='./assets/Riders%E2%80%99%20Quadrant%20Engraved%20Crest.png?v=20.9';
    title.insertAdjacentElement('afterend',img);
  }
}

const qbRenderTrainingBeforeV20=renderTraining;
renderTraining=function(){
  qbRenderTrainingBeforeV20();
  qbApplyRidersQuadrantVisualV20();
};

const qbRenderBeforeV20=render;
render=function(){
  const out=qbRenderBeforeV20();
  qbApplyRidersQuadrantVisualV20();
  return out;
};
