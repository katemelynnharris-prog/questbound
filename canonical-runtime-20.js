// === Questbound canonical pass 20: Rider's Quadrant visual scoping only ===
// Adds visual hook classes only. No behavior, state, data, navigation, or calculations are changed.

function qbApplyRidersQuadrantVisualV20(){
  const isRiders=typeof trainingLabel==='function' && trainingLabel()==="Rider's Quadrant" && state.tab==="Rider's Quadrant";
  screen.classList.toggle('qb-riders-quadrant',isRiders);
  screen.querySelectorAll('.qb-riders-frame').forEach(el=>el.classList.remove('qb-riders-frame'));
  if(!isRiders)return;
  const hero=screen.querySelector('.training-hero') || screen.querySelector('.card');
  if(hero)hero.classList.add('qb-riders-frame');
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
