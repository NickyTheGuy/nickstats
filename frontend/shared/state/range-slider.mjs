export function rangeValues(start,end,min,max){
  const clamp=value=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
  const upper=clamp(end);return {start:Math.min(clamp(start),upper),end:upper};
}
export function moveRangeHandle(range,handle,value,min,max){
  const next=Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
  return handle==='start'?{start:Math.min(next,range.end),end:range.end}:{start:Math.min(range.start,next),end:next};
}
