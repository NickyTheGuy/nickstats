import { useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import ToggleChips from '../../shared/components/forms/ToggleChips.jsx';
import RoundFilter from './RoundFilter.jsx';
import DisplayControls from './DisplayControls.jsx';
import MatchFilters from './MatchFilters.jsx';
import GroupRoundPicker from './GroupRoundPicker.jsx';
const buys=[['all','All'],['full','Full'],['force','Force'],['eco','Eco'],['pistol','Pistol']];
export default function AnalyzerControls({players,selectedPlayers,setSelectedPlayers,colors,side,onSide,selectedCount,filters,setFilters,groupRounds,matchFilters,roundFocus,onClearFocus,mode,showEnemies,onShowEnemies,display,setDisplay,enemyDisplay,setEnemyDisplay}) {
  const [open,setOpen]=useState(false);
  const toggle=(setter,value,checked)=>setter(previous=>checked?[...new Set([...previous,value])]:previous.filter(v=>v!==value));
  return <div className={`analyzer-controls${open?' is-open':''}`}>
    <Button className="button button-secondary analyzer-controls-toggle" aria-expanded={open} aria-controls="analyzerControlPanel" onClick={()=>setOpen(!open)}>{mode==='match'?'Players & filters':`Players & rounds · ${selectedCount}`} {open?'▴':'▾'}</Button>
    {open && <aside id="analyzerControlPanel" className="analyzer-control-panel" aria-label="Analyzer selection">
      {roundFocus&&<div className="analyzer-picker-head"><strong>Focused instances · {roundFocus.instances.length}</strong><Button className="selection-chip" onClick={onClearFocus}>Clear focus</Button></div>}
      <div className="analyzer-picker-head"><strong>Players</strong><Button className="selection-chip" onClick={()=>setSelectedPlayers(selectedPlayers.length===players.length?[]:players.map(p=>p.id))}>{selectedPlayers.length===players.length?'Clear':'All'}</Button></div>
      <ToggleChips label="Analyzer players" className="analyzer-players" options={players.map(p=>[p.id,p.name,{style:{'--player-color':colors.get(p.id)},className:'analyzer-player',title:p.name}])} selected={selectedPlayers} onChange={(id,checked)=>toggle(setSelectedPlayers,id,checked)} />
      <DisplayControls prefix="Player" display={display} setDisplay={setDisplay} />
      {mode==='groups'&&<><RoundFilter label="Enemies" value={showEnemies?'on':'off'} options={[["on","On"],["off","Off"]]} onChange={value=>onShowEnemies(value==='on')} />
        {showEnemies&&<DisplayControls prefix="Enemy" display={enemyDisplay} setDisplay={setEnemyDisplay} />}</>}
      {matchFilters&&<MatchFilters {...matchFilters} />}
      <RoundFilter label="Player side" value={String(side)} options={[["0","All"],["3","CT"],["2","T"]]} onChange={v=>onSide(Number(v))} />
      <RoundFilter label="Round result" value={filters.result} options={[["all","All"],["win","Won"],["loss","Lost"]]} onChange={value=>setFilters(f=>({...f,result:value}))} />
      <RoundFilter multiple label="Your buy" value={filters.buy} options={[...buys,['hero','Hero']]} onChange={value=>setFilters(f=>({...f,buy:value}))} />
      <RoundFilter multiple label="Enemy buy" value={filters.enemyBuy} options={buys} onChange={value=>setFilters(f=>({...f,enemyBuy:value}))} />
      {groupRounds&&<><strong>Rounds</strong><GroupRoundPicker {...groupRounds} /></>}
    </aside>}
  </div>;
}
