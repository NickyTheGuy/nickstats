import MetricList from '../../shared/components/stats/MetricList.jsx';
export default function SelectionMetrics({summary,scope='rounds'}){
  const number=value=>value==null?'—':value.toFixed(2),percent=value=>value==null?'—':`${value.toFixed(1)}%`;
  return <MetricList metrics={[
    ...(scope==='selection'?[]:[['Player instances',String(summary.observations??0)]]),
    [scope==='matches'?'Match win rate':scope==='rounds'?'Round win rate':'Win rate',percent(summary.winRate)],
    ['K–D',summary.combatComplete?`${summary.kills} / ${summary.deaths}`:'—'],
    ['K/D',summary.combatComplete?number(summary.deaths?summary.kills/summary.deaths:summary.kills):'—'],
    ['Rating',number(summary.rating)],...(summary.utility?.count?[['Grenades',String(summary.utility.count)],...summary.utility.metrics]:[])
  ]} />;
}
