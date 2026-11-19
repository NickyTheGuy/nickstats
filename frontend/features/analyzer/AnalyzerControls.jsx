import { useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import ToggleChips from '../../shared/components/forms/ToggleChips.jsx';
import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';
import MultiToggleGroup from '../../shared/components/forms/MultiToggleGroup.jsx';
import RoundPicker from './RoundPicker.jsx';
import MatchFilters from './MatchFilters.jsx';
import GroupRoundPicker from './GroupRoundPicker.jsx';
import { COMBAT_LAYERS } from './state/combat.mjs';
import { UTILITY_TYPES } from './state/replay.mjs';
import { UTILITY_ICONS } from './state/utility.mjs';

const buys=[['all','All'],['full','Full'],['force','Force'],['eco','Eco'],['pistol','Pistol']];
function RoundFilter({label,value,options,onChange,multiple=false}) {
  const Choices=multiple?MultiToggleGroup:ToggleGroup;
  return <div className="analyzer-round-filter"><span>{label}</span><Choices label={label} options={options} value={value} onChange={onChange} className="side-toggle" /></div>;
}
export default function AnalyzerControls({players,selectedPlayers,setSelectedPlayers,colors,utilities,setUtilities,side,onSide,roundPicker,selectedCount,combatLayers,setCombatLayers,filters,setFilters,groupRounds,matchFilters,nameTags,onNameTags,roundFocus,onClearFocus}) {
  const [open,setOpen]=useState(false);
  const toggle=(setter,value,checked)=>setter(previous=>checked?[...new Set([...previous,value])]:previous.filter(v=>v!==value));
  return <div className={`analyzer-controls${open?' is-open':''}`}>
    <Button className="button button-secondary analyzer-controls-toggle" aria-expanded={open} aria-controls="analyzerControlPanel" onClick={()=>setOpen(!open)}>Players & rounds · {selectedCount} {open?'▴':'▾'}</Button>
    {open && <aside id="analyzerControlPanel" className="analyzer-control-panel" aria-label="Analyzer selection">
      {roundFocus&&<div className="analyzer-picker-head"><strong>Focused rounds · {roundFocus.keys.length}</strong><Button className="selection-chip" onClick={onClearFocus}>Clear round focus</Button></div>}
      <div className="analyzer-picker-head"><strong>Players</strong><Button className="selection-chip" onClick={()=>setSelectedPlayers(selectedPlayers.length===players.length?[]:players.map(p=>p.id))}>{selectedPlayers.length===players.length?'Clear':'All'}</Button></div>
      <ToggleChips label="Analyzer players" className="analyzer-players" options={players.map(p=>[p.id,p.name,{style:{'--player-color':colors.get(p.id)},className:'analyzer-player',title:p.name}])} selected={selectedPlayers} onChange={(id,checked)=>toggle(setSelectedPlayers,id,checked)} />
      <RoundFilter label="Name tags" value={nameTags?'on':'off'} options={[["off","Off"],["on","On"]]} onChange={value=>onNameTags(value==='on')} />
      {matchFilters&&<MatchFilters {...matchFilters} />}
      <RoundFilter label="Player side" value={String(side)} options={[["0","All"],["3","CT"],["2","T"]]} onChange={v=>onSide(Number(v))} />
      <RoundFilter label="Round result" value={filters.result} options={[["all","All"],["win","Won"],["loss","Lost"]]} onChange={value=>setFilters(f=>({...f,result:value}))} />
      <RoundFilter multiple label="Your buy" value={filters.buy} options={[...buys,['hero','Hero']]} onChange={value=>setFilters(f=>({...f,buy:value}))} />
      <RoundFilter multiple label="Enemy buy" value={filters.enemyBuy} options={buys} onChange={value=>setFilters(f=>({...f,enemyBuy:value}))} />
      <strong>Utility</strong><ToggleChips label="Utility markers" options={UTILITY_TYPES.map(t=>[t,<><img src={`./assets/grenades/${UTILITY_ICONS[t]}.svg`} alt="" />{t}</>])} selected={utilities} onChange={(type,checked)=>toggle(setUtilities,type,checked)} />
      <strong>Combat</strong><ToggleChips label="Combat layers" options={COMBAT_LAYERS.map(layer=>[layer,layer])} selected={combatLayers} onChange={(layer,checked)=>toggle(setCombatLayers,layer,checked)} />
      <strong>Rounds</strong>{groupRounds ? <GroupRoundPicker {...groupRounds} /> : <RoundPicker {...roundPicker} />}
    </aside>}
  </div>;
}
