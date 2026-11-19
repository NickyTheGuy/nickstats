import { normalizeAnalyzerEntry } from './query.mjs';
import { createDisplay } from './display.mjs';
export const preference=name=>`analyzer.${name}`;
export const strings=(value,max=20000)=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&v.length<=200))].slice(0,max):[];
export const numberIn=(value,min,max,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export const boolean=value=>value===true;
export function sourcePreferences(value){
  const group=normalizeAnalyzerEntry({...value,mode:'groups',players:value?.players||[]});
  return {mode:value?.mode==='groups'?'groups':'match',matchID:/^\d{0,16}$/.test(value?.matchID||'')?value?.matchID||'':'',players:group?.players||[],rules:group?.rules||null,
    map:typeof value?.map==='string'&&/^[a-zA-Z0-9_]{0,100}$/.test(value.map)?value.map:'',date:group?.date||{from:'',through:''},tags:group?.tags||[],
    account:typeof value?.account==='string'?value.account.slice(0,200):null,loaded:value?.loaded===true,route:typeof value?.route==='string'?value.route.slice(0,60000):''};
}
export function displayPreferences(value){const defaults=createDisplay();return Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,Array.isArray(fallback)?Array.isArray(value?.[key])?fallback.filter(v=>value[key].includes(v)):fallback:typeof value?.[key]==='boolean'?value[key]:fallback]));}
export function roundPreferences(value){const buys=['full','force','eco','pistol','hero'];return {result:['all','win','loss'].includes(value?.result)?value.result:'all',buy:strings(value?.buy,5).filter(v=>buys.includes(v)),enemyBuy:strings(value?.enemyBuy,4).filter(v=>buys.includes(v)&&v!=='hero')};}
export function groupRoundPreferences(value){return {sections:strings(value?.sections,1000).filter(v=>/^(reg-[12]|ot-\d+-[12])$/.test(v)),numbers:Array.isArray(value?.numbers)?[...new Set(value.numbers.filter(n=>Number.isInteger(n)&&n>=1&&n<=65535))].slice(0,20000):[]};}
export function viewPreferences(value){const zoom=numberIn(value?.zoom,1,4,1),max=(zoom-1)*512;return {zoom,x:numberIn(value?.x,-max,max,0),y:numberIn(value?.y,-max,max,0)};}
export function utilityPreferences(value){const type=['HE','Flash','Fire'].includes(value?.type)?value.type:'HE';return {type,metric:type==='Flash'&&['enemies','blind_ms'].includes(value?.metric)?value.metric:type==='Flash'?'enemies':'damage',minimum:typeof value?.minimum==='string'&&value.minimum.length<=20?value.minimum:type==='Flash'?'1':'40'};}
export function focusPreferences(value){
  if(!value||typeof value.map!=='string'||!/^[a-zA-Z0-9_]{1,100}$/.test(value.map))return null;
  const keys=strings(value.keys),allowed=new Set(keys),instances=Array.isArray(value.instances)?value.instances.filter(row=>row&&allowed.has(row.roundKey)&&(row.player===null||typeof row.player==='string'&&row.player.length<=200)).map(row=>({roundKey:row.roundKey,player:row.player})):[];
  if(!keys.length||!instances.length)return null;
  const result={map:value.map,keys,instances,previousMatchRounds:Array.isArray(value.previousMatchRounds)?strings(value.previousMatchRounds):null};
  return JSON.stringify(result).length<=65536?result:null;
}
