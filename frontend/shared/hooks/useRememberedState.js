import { useEffect,useState,useCallback,useMemo } from 'react';
import { browserPreferences } from '../state/preferences.mjs';

export default function useRememberedState(key,fallback,normalize) {
  const store=browserPreferences();
  const initial=useMemo(()=>key?store.read(key,fallback,normalize):typeof fallback==='function'?fallback():fallback,[key]);
  const [state,setState]=useState(()=>({key,value:initial}));
  const value=state.key===key?state.value:initial;
  const setValue=useCallback(next=>setState(current=>({key,value:typeof next==='function'?next(current.key===key?current.value:initial):next})),[key,initial]);
  useEffect(()=>{if(key)store.set(key,normalize?normalize(value):value);},[store,key,value]);
  return [value,setValue];
}
