import { useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import CheckboxGroup from '../../shared/components/forms/CheckboxGroup.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import RoundPicker from './RoundPicker.jsx';
import { UTILITY_TYPES } from './state/replay.mjs';

export default function AnalyzerControls({players,selectedPlayers,setSelectedPlayers,colors,utilities,setUtilities,side,onSide,roundPicker,selectedCount}) {
  const [open,setOpen]=useState(false);
  const toggle=(setter,value,checked)=>setter(previous=>checked?[...new Set([...previous,value])]:previous.filter(v=>v!==value));
  return <div className={`analyzer-controls${open?' is-open':''}`}>
    <Button className="button button-secondary analyzer-controls-toggle" aria-expanded={open} aria-controls="analyzerControlPanel" onClick={()=>setOpen(!open)}>Players & rounds · {selectedCount} {open?'▴':'▾'}</Button>
    {open && <aside id="analyzerControlPanel" className="analyzer-control-panel" aria-label="Analyzer selection">
      <div className="analyzer-picker-head"><strong>Players</strong><Button className="button button-secondary" onClick={()=>setSelectedPlayers(selectedPlayers.length===players.length?[]:players.map(p=>p.id))}>{selectedPlayers.length===players.length?'Clear':'All'}</Button></div>
      <CheckboxGroup label="Analyzer players" className="analyzer-players" labelClassName="analyzer-player" options={players.map(p=>[p.id,p.name,{}, {style:{'--player-color':colors.get(p.id)}}])} selected={selectedPlayers} onChange={(id,checked)=>toggle(setSelectedPlayers,id,checked)} />
      <OptionField label="Player side" value={String(side)} options={[["0","Both sides"],["2","T-side"],["3","CT-side"]]} onChange={v=>onSide(Number(v))} />
      <strong>Utility</strong><CheckboxGroup label="Utility markers" className="analyzer-utility" options={UTILITY_TYPES.map(t=>[t,<><img src={`./assets/grenades/${{Smoke:'smokegrenade',Flash:'flashbang',HE:'hegrenade',Fire:'molotov',Decoy:'decoy'}[t]}.svg`} alt="" />{t}</>])} selected={utilities} onChange={(type,checked)=>toggle(setUtilities,type,checked)} />
      <strong>Rounds</strong><RoundPicker {...roundPicker} side={side} players={selectedPlayers} />
    </aside>}
  </div>;
}
