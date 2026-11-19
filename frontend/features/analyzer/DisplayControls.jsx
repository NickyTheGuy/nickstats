import RoundFilter from './RoundFilter.jsx';
import ToggleChips from '../../shared/components/forms/ToggleChips.jsx';
import { COMBAT_LAYERS } from './state/combat.mjs';
import { UTILITY_TYPES } from './state/replay.mjs';
import { UTILITY_ICONS } from './state/utility.mjs';
export default function DisplayControls({prefix,display,setDisplay}) {
  const change=(key,value)=>setDisplay(previous=>({...previous,[key]:value}));
  const toggle=(key,value,checked)=>setDisplay(previous=>({...previous,[key]:checked?[...new Set([...previous[key],value])]:previous[key].filter(v=>v!==value)}));
  return <fieldset className="analyzer-display-controls"><legend>{prefix==='Enemy'?'Enemy display':'Player display'}</legend>
    {[["players","cells"],["names","name tags"],["items","held items"],["blindness","blindness"]].map(([key,label])=><RoundFilter key={key} label={`${prefix} ${label}`} value={display[key]?'on':'off'} options={[["on","On"],["off","Off"]]} onChange={value=>change(key,value==='on')} />)}
    <ToggleChips label={`${prefix} utility display`} options={[["Live","Live effects"],["History","History icons"]]} selected={display.utilityLayers} onChange={(value,checked)=>toggle('utilityLayers',value,checked)} />
    <ToggleChips label={`${prefix} utility types`} options={UTILITY_TYPES.map(t=>[t,<><img src={`./assets/grenades/${UTILITY_ICONS[t]}.svg`} alt="" />{t}</>])} selected={display.utilities} onChange={(value,checked)=>toggle('utilities',value,checked)} />
    <ToggleChips label={`${prefix} combat`} options={COMBAT_LAYERS.map(layer=>[layer,layer])} selected={display.combat} onChange={(value,checked)=>toggle('combat',value,checked)} />
  </fieldset>;
}
