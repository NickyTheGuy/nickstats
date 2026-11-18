import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../buttons/Button.jsx';

export default function TooltipButton({label,content,children,...props}) {
  const trigger=useRef(null),id=useId(),[open,setOpen]=useState(false),[position,setPosition]=useState({});
  function locate() {
    const box=trigger.current.getBoundingClientRect(),left=Math.max(10,Math.min(innerWidth-270,box.left));
    setPosition(box.top>180?{left,bottom:innerHeight-box.top+8}:{left,top:box.bottom+8});
  }
  function show(){locate();setOpen(true);}
  useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!trigger.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',locate);window.addEventListener('scroll',locate,true);
    return ()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',locate);window.removeEventListener('scroll',locate,true);};
  },[open]);
  return <><Button {...props} ref={trigger} aria-label={label} aria-describedby={open?id:undefined}
    onPointerEnter={event=>{if(event.pointerType!=='touch')show();}} onPointerLeave={()=>{if(document.activeElement!==trigger.current)setOpen(false);}}
    onFocus={show} onBlur={()=>setOpen(false)} onClick={show} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);}}}>{children}</Button>
    {open&&createPortal(<div id={id} role="tooltip" className="hover-tooltip" style={position}>{content}</div>,document.body)}</>;
}
