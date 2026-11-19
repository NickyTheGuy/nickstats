export function createPreferenceStore(storage,{key='nickstats.uiPreferences.v1',delay=200,schedule=setTimeout,cancel=clearTimeout}={}) {
  let values={},timer=null,dirty=false;
  try {const raw=storage?.getItem(key);if(raw&&raw.length<=262144){const saved=JSON.parse(raw);if(saved?.version===1&&saved.values&&typeof saved.values==='object'&&!Array.isArray(saved.values))values=saved.values;}}catch{}
  function flush(){if(timer!==null)cancel(timer);timer=null;if(!dirty)return;try{const text=JSON.stringify({version:1,values});if(text.length<=262144){storage?.setItem(key,text);dirty=false;}}catch{}}
  return {
    read(name,fallback,normalize=value=>value){try{return Object.hasOwn(values,name)?normalize(values[name]):typeof fallback==='function'?fallback():fallback;}catch{return typeof fallback==='function'?fallback():fallback;}},
    set(name,value){if(!name||Object.hasOwn(values,name)&&JSON.stringify(values[name])===JSON.stringify(value))return;dirty=true;values={...values,[name]:value};if(timer!==null)cancel(timer);timer=schedule(flush,delay);},
    flush
  };
}
let browserStore;
export function browserPreferences(){
  if(!browserStore){let storage;try{storage=window.localStorage;}catch{}browserStore=createPreferenceStore(storage);
    if(typeof window!=='undefined'){window.addEventListener('pagehide',browserStore.flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)browserStore.flush();});}
  }
  return browserStore;
}
