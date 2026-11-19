import ToggleButton from '../../shared/components/buttons/ToggleButton.jsx';
import { combinedSections } from './state/round-selection.mjs';

function BatchChip({keys,selected,onToggle,children,label}) {
  const set=new Set(selected),all=keys.length>0&&keys.every(key=>set.has(key)),some=keys.some(key=>set.has(key));
  return <ToggleButton selected={all} disabled={!keys.length} className={`selection-chip ${some&&!all?'partial':''}`}
    aria-label={label} title={label} onClick={()=>onToggle(keys)}>{children}</ToggleButton>;
}
export default function RoundPicker({replays,selected,onToggleSet,filters}) {
  const sections=combinedSections(replays,filters),all=sections.flatMap(s=>s.keys);
  return <div className="analyzer-match-rounds" role="group" aria-label="Match rounds">
    <BatchChip keys={all} selected={selected} onToggle={onToggleSet} label="All rounds">All</BatchChip>
    {sections.map(section=><div className="analyzer-match-half" key={section.key} role="group" aria-label={section.label}>
      <BatchChip keys={section.keys} selected={selected} onToggle={onToggleSet} label={section.label}>{section.key.startsWith('reg-')?`H${section.key.slice(4)}`:section.label.replace(' · half ',' · ')}</BatchChip>
      {section.numbers.map(([number,keys])=><BatchChip key={number} keys={keys} selected={selected} onToggle={onToggleSet} label={`Round ${number} · ${section.label}`}>{number}</BatchChip>)}
    </div>)}
  </div>;
}
