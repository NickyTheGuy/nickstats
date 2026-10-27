import ProgressBar from '../../shared/components/feedback/ProgressBar.jsx';

export default function BatchQueue({ model }) {
  return <section className="demo-batch" id="demoBatch" aria-labelledby="demoBatchTitle" aria-busy={model.batchRunning} hidden={model.items.length < 2}>
    <div className="demo-batch-head"><div><h3 id="demoBatchTitle">Batch queue</h3><p>Existing matches are replaced automatically when reparsed.</p></div>
      <strong id="demoBatchSummary">{model.summary}</strong>
    </div>
    <ProgressBar id="demoBatchBar" className="demo-batch-track" value={model.completed} max={model.total} label="Demo batch completion" />
    <ol className="demo-batch-list" id="demoBatchList">{model.items.map(item => <li key={item.index} data-batch-index={item.index} data-state={item.state}>
      <span className="demo-batch-name">{item.name}</span><span className="demo-batch-detail">{item.detail}</span>
    </li>)}</ol>
  </section>;
}
