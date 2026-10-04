const screen=document.querySelector('#screen');
const nav=document.querySelector('#mainNav');
nav?.addEventListener('click',e=>{
  if(!e.target.closest('button'))return;
  screen?.removeAttribute('data-qb-polished');
  screen?.removeAttribute('data-qb-holiday-done');
},{capture:true});
