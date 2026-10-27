import Button from '../../shared/components/buttons/Button.jsx';
import ComparisonBody from '../comparisons/ComparisonBody.jsx';

export default function SessionPage({ status, model, onRetry }) {
  return <>
    <header className="section-head">
      <div><h2>Session</h2><p id="sessionQuickMeta">{model?.meta}</p></div>
    </header>
    <p id="sessionStatus" role="status" aria-live="polite" className={status.error ? 'error' : undefined}>
      {status.error || (status.loading ? 'Loading session…' : '')}
    </p>
    <Button id="sessionRetry" className="button button-secondary" hidden={!status.error} onClick={onRetry}>Retry</Button>
    <div id="sessionContent" hidden={!status.ready}>
      <ComparisonBody model={model} prefix="session" mapsLabel="Session maps"
        emptyMessage="No qualifying matches for this map." />
    </div>
  </>;
}
