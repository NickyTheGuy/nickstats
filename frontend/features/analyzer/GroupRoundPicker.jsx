import ToggleChips from '../../shared/components/forms/ToggleChips.jsx';
import { roundSections } from './state/round-selection.mjs';
import { toggleChoice } from './state/query.mjs';

export default function GroupRoundPicker({replays,value,onChange}) {
  const sections=[...new Map(replays.flatMap(r=>roundSections(r)).map(s=>[s.key,s])).values()];
  const numbers=[...new Set(replays.flatMap(r=>r.rounds.map(round=>round.number)))].sort((a,b)=>a-b);
  const phaseKeys=phase=>sections.filter(s=>s.phase===phase).map(s=>s.key);
  function togglePhase(phase,checked) {
    const keys=phaseKeys(phase);
    onChange({...value,sections:checked?[...new Set([...value.sections,...keys])]:value.sections.filter(k=>!keys.includes(k))});
  }
  return <div className="analyzer-round-picker">
    <ToggleChips label="Round phases" options={[["all","All halves"],["regulation","Regulation"],["overtime","Overtime"]]}
      selected={!value.sections.length?['all']:['regulation','overtime'].filter(p=>phaseKeys(p).length&&phaseKeys(p).every(k=>value.sections.includes(k)))}
      onChange={(key,checked)=>key==='all'?onChange({...value,sections:[]}):togglePhase(key,checked)} />
    <ToggleChips label="Round halves" options={sections.map(s=>[s.key,s.label])} selected={value.sections}
      onChange={key=>onChange({...value,sections:toggleChoice(value.sections,key)})} />
    <strong>Round numbers</strong>
    <ToggleChips label="Round numbers across matches" options={[["all","All numbers"],...numbers.map(n=>[n,String(n)])]}
      selected={value.numbers.length?value.numbers:['all']} onChange={number=>onChange({...value,numbers:number==='all'?[]:toggleChoice(value.numbers,number)})} />
  </div>;
}
