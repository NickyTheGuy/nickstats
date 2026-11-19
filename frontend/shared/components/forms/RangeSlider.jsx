import { useRef,useState } from 'react';
import { rangeValues,moveRangeHandle } from '../../state/range-slider.mjs';

export default function RangeSlider({start,end,min=0,max,step=1,onStart,onEnd,startLabel='Start',endLabel='End',startText,endText,disabled=false,children}) {
  const [active,setActive]=useState('end'),drag=useRef(null),range=rangeValues(start,end,min,max),span=max-min;
  const percent=value=>span?100*(value-min)/span:0;
  function change(handle,value){const next=moveRangeHandle(range,handle,value,min,max);if(next.start!==range.start)onStart(next.start);if(next.end!==range.end)onEnd(next.end);}
  function point(event){const box=event.currentTarget.getBoundingClientRect(),width=Math.max(1,box.width-18),fraction=Math.max(0,Math.min(1,(event.clientX-box.left-9)/width));return Math.max(min,Math.min(max,min+Math.round(fraction*span/step)*step));}
  function down(event){if(disabled||event.button!==0||event.target.tagName==='INPUT')return;event.preventDefault();const value=point(event),handle=range.start===range.end&&value<range.start||Math.abs(value-range.start)<Math.abs(value-range.end)?'start':'end';drag.current=handle;setActive(handle);event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.querySelector(`[data-handle="${handle}"]`).focus({preventScroll:true});change(handle,value);}
  return <div className="ui-range-slider" data-active={active} data-disabled={disabled||undefined} style={{'--range-start':`${percent(range.start)}%`,'--range-end':`${percent(range.end)}%`}}
    onPointerDown={down} onPointerMove={event=>{if(drag.current)change(drag.current,point(event));}} onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
    <div className="ui-range-track" aria-hidden="true"><span className="ui-range-window" /></div>
    {children}
    <div className="ui-range-masks" aria-hidden="true"><span className="ui-range-before"/><span className="ui-range-after"/></div>
    {[['start',range.start,startLabel,startText],['end',range.end,endLabel,endText]].map(([handle,value,label,text])=><input key={handle} data-handle={handle} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      aria-label={label} aria-valuemax={handle==='start'?range.end:max} aria-valuetext={text}
      onFocus={()=>setActive(handle)} onPointerDown={()=>setActive(handle)} onChange={event=>change(handle,Number(event.target.value))} />)}
  </div>;
}
