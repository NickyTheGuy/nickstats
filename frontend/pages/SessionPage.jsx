import ComparisonControls from '../components/ComparisonControls.jsx';
import Scoreboard from '../components/Scoreboard.jsx';

export default function SessionPage({ status, model, onRetry }) {
  return <>
    <header className="section-head">
      <div><h2>Session</h2><p id="sessionQuickMeta">{model?.meta}</p></div>
    </header>
    <p id="sessionStatus" role="status" aria-live="polite" className={status.error ? 'error' : undefined}>
      {status.error || (status.loading ? 'Loading session…' : '')}
    </p>
    <button id="sessionRetry" type="button" className="button button-secondary" hidden={!status.error} onClick={onRetry}>Retry</button>
    <div id="sessionContent" hidden={!status.ready}>
      {model && <>
        <ComparisonControls model={model} />
        <nav id="sessionQuickMaps" className="match-browser-tabs quick-comparison-map-tabs" role="tablist" aria-label="Session maps">
          {model.maps.map(([value, label]) => <button key={value} type="button" role="tab"
            className={`match-browser-tab${model.map === value ? ' active' : ''}`}
            aria-selected={model.map === value} tabIndex={model.map === value ? 0 : -1}
            onClick={() => model.actions.map(value)}>{label}</button>)}
        </nav>
        <Scoreboard model={model} tableId="sessionQuickTable" />
        <p id="sessionQuickEmpty" className="quick-comparison-empty" hidden={!model.empty}>No qualifying matches for this map.</p>
      </>}
    </div>
  </>;
}
