import useSelectionMatches from '../analyzer/hooks/useSelectionMatches.js';
import ComparisonBody from '../comparisons/ComparisonBody.jsx';
import useComparison from '../comparisons/hooks/useComparison.js';
import SelectionMetrics from '../analyzer/SelectionMetrics.jsx';
import Button from '../../shared/components/buttons/Button.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
export default function SelectionPage({context}){
  const state=useSelectionMatches(context);
  const model=useComparison(state.players?{players:state.players,summarize:window.NickStatsPlayerStats.sessionSummary,metaSuffix:'Whole matches'}:null,context);
  return <>
    <header className="section-head"><div><h2>Selection</h2><p>{context.roundSummary.count} selected rounds · {context.matches.length} matches</p></div></header>
    <div className="analyzer-selection-context"><section><h3>Selected events</h3><SelectionMetrics summary={context.eventSummary} scope="selection" /></section><section><h3>Selected player rounds</h3><SelectionMetrics summary={{...context.roundSummary,combatComplete:context.roundSummary.kills!=null}} /></section></div>
    <div className="analyzer-selection-matches" aria-label="Selected matches">{context.matches.map(match=><a className="button button-secondary" key={match.id} href={`#match/${match.id}`}>Match #{match.id} · {match.map.replace(/^de_/,'')} · Rounds {match.rounds.join(', ')}</a>)}</div>
    <h3>Whole-match comparison</h3>
    {state.loading&&<p role="status">Loading match statistics…</p>}<FormMessage error>{state.error}</FormMessage>
    {state.error&&<Button className="button button-secondary" onClick={state.retry}>Retry</Button>}
    <ComparisonBody model={model} prefix="selection" mapsLabel="Selection maps" emptyMessage="No matching saved statistics." />
  </>;
}
