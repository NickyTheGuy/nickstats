import { useLayoutEffect, useState } from 'react';

export default function useElementSize(ref) {
  const [size,setSize]=useState({width:0,height:0});
  useLayoutEffect(()=>{
    const measure=()=>{const box=ref.current.getBoundingClientRect();setSize({width:box.width,height:box.height});};
    const observer=new ResizeObserver(measure);observer.observe(ref.current);measure();
    return ()=>observer.disconnect();
  },[ref]);
  return size;
}
