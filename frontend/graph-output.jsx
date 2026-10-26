import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import GraphSummary from './graphs/GraphSummary.jsx';
import GraphLegend from './graphs/GraphLegend.jsx';
import { graphOutputModel } from './state/graph-output.mjs';

function GraphOutput({ model, prefix, legend, note }) {
  return <>
    <GraphSummary model={model} />
    {createPortal(<GraphLegend cards={model.cards} />, legend)}
    {createPortal(<p id={`${prefix}GraphNote`} hidden={!model.note}>{model.note}</p>, note)}
  </>;
}
const roots = new Map();
window.NickStatsGraphOutputUI = Object.freeze({
  render(prefix, input) {
    if (!roots.has(prefix)) roots.set(prefix, {
      root: createRoot(document.getElementById(`${prefix}GraphSummary`)),
      legend: document.getElementById(`${prefix}GraphLegend`), note: document.getElementById(`${prefix}GraphNoteApp`)
    });
    const { root, legend, note } = roots.get(prefix);
    root.render(<GraphOutput model={graphOutputModel(input)} prefix={prefix} legend={legend} note={note} />);
  }
});
