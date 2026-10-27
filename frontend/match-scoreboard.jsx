import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import Scoreboard from './components/Scoreboard.jsx';
import ComparisonControls from './components/ComparisonControls.jsx';

const roots = new WeakMap();
window.NickStatsMatchScoreboardUI = Object.freeze({
  render(target, model) {
    if (!roots.has(target)) roots.set(target, createRoot(target));
    roots.get(target).render(<>
      <Scoreboard model={model} />
      {createPortal(<ComparisonControls bare model={model} defaults={model.defaultSections} modes={[["totals", "Totals"], ["round", "Per round"]]} />, document.getElementById('demoScoreboardControls'))}
    </>);
  }
});
