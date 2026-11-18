import IconButton from '../../shared/components/buttons/IconButton.jsx';
import MetricList from '../../shared/components/stats/MetricList.jsx';

export default function AreaSummary({summary,loading,onClear}) {
  const number=value=>value==null?'—':value.toFixed(2);
  return <aside className="analyzer-area-summary" aria-label="Selected area outcomes" aria-busy={loading}>
    <header><strong>Selected area</strong><IconButton label="Clear selected area" size={14} controlSize="28px" onClick={onClear}><path d="m6 6 12 12M6 18 18 6" /></IconButton></header>
    {loading?<span role="status">Loading rounds…</span>:<>
      <div className="analyzer-area-count" aria-live="polite"><strong>{summary.count} / {summary.total}</strong><span>rounds · {summary.percent.toFixed(1)}%</span></div>
      <div title="Full-round outcomes of the players inside this area at the current playback time. Win rate counts each team's result once per round. Rating is unavailable without exact saved damage, assists and KAST."><MetricList metrics={[
        ['Win rate',summary.winRate==null?'—':`${summary.winRate.toFixed(1)}%`],
        ['K–D',summary.combatComplete?`${summary.kills} / ${summary.deaths}`:'—'],
        ['K/D',summary.combatComplete&&summary.observations?number(summary.deaths?summary.kills/summary.deaths:summary.kills):'—'],
        ['Rating',number(summary.rating)]
      ]} /></div>
    </>}
  </aside>;
}
