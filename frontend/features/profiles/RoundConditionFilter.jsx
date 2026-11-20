import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import Button from '../../shared/components/buttons/Button.jsx';
import { roundConditions } from './state/round-conditions.mjs';
export default function RoundConditionFilter({value='ALL',loading=false,error='',rounds=0,covered=0,expected=0,onChange,onRetry}){
  return <div className="profile-round-conditions"><span>Round conditions</span>
    <ToggleGroup label="Player round conditions" value={value} options={roundConditions.map(([key,label])=>[key,label,{title:key==='opening_attempt'?'Rounds with an opening kill or opening death':key==='no_opening'?'Rounds with neither an opening kill nor an opening death':label}])} onChange={onChange} className="side-toggle" />
    {value!=='ALL'&&<FormMessage error={Boolean(error)}>{error|| (loading?'Loading round conditions…':`${rounds.toLocaleString()} matching rounds · full-round stats${covered<expected?` · condition data available for ${covered.toLocaleString()} of ${expected.toLocaleString()} rounds`:''}`)}</FormMessage>}
    {value!=='ALL'&&error&&<Button className="button button-secondary" onClick={onRetry}>Retry conditions</Button>}
  </div>;
}
