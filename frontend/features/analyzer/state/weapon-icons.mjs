import { GRENADE_ICONS } from './replay.mjs';
export const WEAPON_ICONS=['ak47','aug','awp','bizon','famas','g3sg1','galilar','m249','m4a1','m4a1_silencer','mac10','mag7','mp5sd','mp7','mp9','negev','nova','p90','sawedoff','scar20','sg556','ssg08','ump45','xm1014','cz75a','deagle','elite','fiveseven','glock','hkp2000','p250','revolver','tec9','usp_silencer','taser','knife'];
const allowed=new Set([...WEAPON_ICONS,...GRENADE_ICONS]);
export function weaponIconKey(weapon) {
  let key=String(weapon||'').toLowerCase().replace(/^weapon_/,'');
  if(key.startsWith('knife')||key==='bayonet')key='knife';
  key=({inferno:'molotov',fire:'molotov',m4a1_silencer_off:'m4a1_silencer',usp_silencer_off:'usp_silencer',m4a4:'m4a1',p2000:'hkp2000'})[key]||key;
  return allowed.has(key)?key:null;
}
export function weaponIconPath(key) {
  return allowed.has(key)?`./assets/${GRENADE_ICONS.includes(key)?'grenades':'weapons'}/${key}.svg`:null;
}
