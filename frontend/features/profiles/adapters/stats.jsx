import { createRoot } from 'react-dom/client';
import StatCards from '../StatCards.jsx';
import MetricList from '../../../shared/components/stats/MetricList.jsx';
import CountStrip from '../../../shared/components/stats/CountStrip.jsx';
import DataTable from '../../../shared/components/tables/DataTable.jsx';

const roots = new WeakMap();
function render(target, Component, props) {
  if (!target) return;
  if (!roots.has(target)) roots.set(target, createRoot(target));
  roots.get(target).render(<Component {...props} />);
}
window.NickStatsProfileUI = Object.freeze({
  cards(target, cards) { render(target, StatCards, { cards }); },
  list(target, metrics) { render(target, MetricList, { metrics }); },
  strip(target, metrics) { render(target, CountStrip, { metrics }); },
  table(target, headers, rows, sortRows) { render(target, DataTable, { headers, rows, sortRows }); }
});
