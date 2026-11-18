import { useEffect, useState } from 'react';
import { GRENADE_ICONS } from './state/replay.mjs';
let iconPromise;
export function useGrenadeIcons() {
  const [icons,setIcons]=useState({});
  useEffect(()=>{
    let active=true;
    iconPromise ||= Promise.all(GRENADE_ICONS.map(name=>new Promise(resolve=>{
      const image=new Image();image.onload=()=>resolve([name,image]);image.onerror=()=>resolve([name,null]);image.src=`./assets/grenades/${name}.svg`;
    }))).then(entries=>Object.fromEntries(entries));
    iconPromise.then(value=>{if(active)setIcons(value);});
    return ()=>{active=false;};
  },[]);
  return icons;
}
