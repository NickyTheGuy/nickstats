import { createRoot } from 'react-dom/client';
import Chart from './graphs/Chart.jsx';
import { chartFrame, chartMark } from './state/chart.mjs';

window.NickStatsChartModel = Object.freeze({ frame: chartFrame, mark: chartMark });
const roots = new WeakMap();
window.NickStatsChartUI = Object.freeze({
  render(target, model, { frameClassName } = {}) {
    if (!roots.has(target)) roots.set(target, createRoot(target));
    const chart = <Chart model={model} id={model.id || `${target.id}Svg`} />;
    roots.get(target).render(frameClassName ? <div className={frameClassName}>{chart}</div> : chart);
  }
});
