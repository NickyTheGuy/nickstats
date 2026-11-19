import { effectEnd } from './utility.mjs';
export const inEventWindow=(eventTime,start,end)=>eventTime>=start&&eventTime<=end;
export function utilityWindowVisible(effect,{time,startTime=0,history,live,duration}) {
  return effect.time<=time&&(history&&effect.time>=startTime||live&&time<effectEnd(effect,duration));
}
