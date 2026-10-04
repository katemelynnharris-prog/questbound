(()=>{
  const Native=window.MutationObserver;
  if(!Native||window.__QB_STABILITY)return;
  const pending=new Set();
  let timer=null, suppressUntil=0, flushing=false;
  const screen=()=>document.querySelector('#screen');
  function schedule(delay=22){
    clearTimeout(timer);
    const wait=Math.max(delay,suppressUntil-Date.now()+8);
    timer=setTimeout(flush,Math.max(8,wait));
  }
  function queue(instance,mutations){
    instance._last=mutations;
    pending.add(instance);
    screen()?.classList.add('qb-switching','qb-v3-wait');
    schedule();
  }
  function flush(){
    if(flushing)return;
    if(Date.now()<suppressUntil){schedule();return;}
    if(!pending.size)return;
    const batch=[...pending];pending.clear();flushing=true;
    suppressUntil=Date.now()+650;
    try{for(const instance of batch)instance._cb(instance._last||[],instance)}finally{flushing=false}
  }
  class StableMutationObserver{
    constructor(cb){this._cb=cb;this._last=[];this._native=new Native(m=>queue(this,m))}
    observe(target,opts){return this._native.observe(target,opts)}
    disconnect(){this._native.disconnect();pending.delete(this)}
    takeRecords(){return this._native.takeRecords()}
  }
  window.__QB_NATIVE_MUTATION_OBSERVER=Native;
  window.MutationObserver=StableMutationObserver;
  window.__QB_STABILITY={
    release(){suppressUntil=0;pending.clear();clearTimeout(timer)},
    settle(ms=650){suppressUntil=Math.max(suppressUntil,Date.now()+ms)},
    pulse(){suppressUntil=0;schedule(8)}
  };
  document.addEventListener('click',e=>{
    if(e.target.closest('#mainNav button')){
      window.__QB_STABILITY.release();
      screen()?.classList.add('qb-switching','qb-v3-wait');
      return;
    }
    if(e.target.closest('[data-item-action],[data-qb-spec],[data-qb-char],[data-qb-use]')){
      window.__QB_STABILITY.settle(520);
      setTimeout(()=>window.__QB_STABILITY.pulse(),540);
    }
  },true);
})();
