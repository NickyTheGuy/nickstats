import { useEffect,useRef } from 'react';
import IconButton from '../../shared/components/buttons/IconButton.jsx';
import ToggleButton from '../../shared/components/buttons/ToggleButton.jsx';
import { combinedSections,adjacentRounds } from './state/round-selection.mjs';

function BatchChip({keys,selected,onToggle,children,label,roundKey}) {
  const set=new Set(selected),all=keys.length>0&&keys.every(key=>set.has(key)),some=keys.some(key=>set.has(key));
  return <ToggleButton selected={all} disabled={!keys.length} className={`selection-chip ${some&&!all?'partial':''}`}
    data-round-key={roundKey} aria-label={label} title={label} onClick={()=>onToggle(keys)}>{children}</ToggleButton>;
}
export default function RoundPicker({replays,selected,onToggleSet,onNavigate,filters}) {
  const strip=useRef(null),previousSelection=useRef(selected);
  useEffect(()=>{if(previousSelection.current!==selected&&selected.length===1)[...strip.current.querySelectorAll('[data-round-key]')].find(node=>node.dataset.roundKey===selected[0])?.scrollIntoView({block:'nearest',inline:'nearest'});previousSelection.current=selected;},[selected]);
  const adjacent=adjacentRounds(replays,selected,filters);
  const sections=combinedSections(replays,filters),all=sections.flatMap(s=>s.keys);
  return <div className="analyzer-round-strip"><div ref={strip} className="analyzer-match-rounds" role="group" aria-label="Match rounds">
    <BatchChip keys={all} selected={selected} onToggle={onToggleSet} label="All rounds">All</BatchChip>
    {sections.map(section=><div className="analyzer-match-half" key={section.key} role="group" aria-label={section.label}>
      <BatchChip keys={section.keys} selected={selected} onToggle={onToggleSet} label={section.label}>{section.key.startsWith('reg-')?`H${section.key.slice(4)}`:section.label.replace(' · half ',' · ')}</BatchChip>
      {section.numbers.map(([number,keys])=><BatchChip key={number} keys={keys} selected={selected} onToggle={onToggleSet} roundKey={keys.length===1?keys[0]:null} label={`Round ${number} · ${section.label}`}>{number}</BatchChip>)}
    </div>)}
  </div><div className="analyzer-round-arrows" role="group" aria-label="Round navigation">
    <IconButton label="Previous round" className="selection-chip" size={14} controlSize="28px" disabled={!adjacent.previous} onClick={()=>onNavigate(adjacent.previous)}><path d="m14 5-7 7 7 7" /></IconButton>
    <IconButton label="Next round" className="selection-chip" size={14} controlSize="28px" disabled={!adjacent.next} onClick={()=>onNavigate(adjacent.next)}><path d="m10 5 7 7-7 7" /></IconButton>
  </div></div>;
}
