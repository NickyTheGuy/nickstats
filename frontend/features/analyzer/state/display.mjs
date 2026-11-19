import { UTILITY_TYPES } from './replay.mjs';
import { COMBAT_LAYERS } from './combat.mjs';
import { selectionRoundKey } from './selection-targets.mjs';
export function createDisplay(){return {players:true,names:false,items:true,blindness:true,utilityLayers:['Live'],utilities:[...UTILITY_TYPES],combat:[...COMBAT_LAYERS]};}
export function hasEnemyMovement(display){return display.players||display.utilityLayers.length&&display.utilities.length||display.combat.some(key=>['Kills','Deaths','Gunfire'].includes(key));}
export function roundChannels(round,{rosters,players,side=0,display,enemyDisplay}) {
  const roster=rosters?.get(selectionRoundKey(round));
  return [{ids:new Set(roster?roster.primary:players),display,side,enemy:false},
    ...(roster?.enemies.length?[{ids:new Set(roster.enemies),display:enemyDisplay,side:0,enemy:true}]:[])];
}
