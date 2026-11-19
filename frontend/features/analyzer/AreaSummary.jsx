import Button from '../../shared/components/buttons/Button.jsx';
import IconButton from '../../shared/components/buttons/IconButton.jsx';
import MetricList from '../../shared/components/stats/MetricList.jsx';

export default function AreaSummary({summary,loading,onClear,onFocus}) {
  const number=value=>value==null?'—':value.toFixed(2);
  return <aside className="analyzer-area-summary" aria-label="Selected round outcomes" aria-busy={loading}>
    <header><strong>Selected rounds</strong><IconButton label="Clear selection" size={14} controlSize="28px" onClick={onClear}><path d="m6 6 12 12M6 18 18 6" /></IconButton></header>
    {loading?<span role="status">Loading rounds…</span>:<>
      <div className="analyzer-area-count" aria-live="polite"><strong>{summary.count} / {summary.total}</strong><span>rounds · {summary.percent.toFixed(1)}%</span></div>
      <div title="Full-round outcomes of selected players and event owners. Each player counts once per match-round; each selected grenade counts once. Win rate counts each team's result once per round. Rating is unavailable without exact saved damage, assists and KAST."><MetricList metrics={[
        ['Win rate',summary.winRate==null?'—':`${summary.winRate.toFixed(1)}%`],
        ['K–D',summary.combatComplete?`${summary.kills} / ${summary.deaths}`:'—'],
        ['K/D',summary.combatComplete&&summary.observations?number(summary.deaths?summary.kills/summary.deaths:summary.kills):'—'],
        ['Rating',number(summary.rating)],
        ...(summary.utility.count?[['Grenades',String(summary.utility.count)],...summary.utility.metrics]:[])
      ]} /></div>
      <Button className="button button-primary analyzer-focus-button" disabled={!summary.count} onClick={onFocus}>Focus rounds</Button>
    </>}
  </aside>;
}
