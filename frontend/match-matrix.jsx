import { createRoot } from 'react-dom/client';
import MatrixTable from './components/MatrixTable.jsx';
import { matchMatrix } from './state/match-matrix.mjs';

const roots = new WeakMap();
window.NickStatsMatchMatrixUI = Object.freeze({
  render(target, teams, kind) {
    if (!roots.has(target)) roots.set(target, createRoot(target));
    roots.get(target).render(<MatrixTable {...matchMatrix(teams, kind)} />);
  }
});
