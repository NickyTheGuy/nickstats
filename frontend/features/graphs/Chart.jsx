import { useRef } from 'react';
import SvgMark from './SvgMark.jsx';
import ChartTooltip from './ChartTooltip.jsx';
import EmptyState from '../../shared/components/feedback/EmptyState.jsx';
import useChartTooltip from './hooks/useChartTooltip.js';

export default function Chart({ model, id }) {
  const svg = useRef(null), tooltip = useChartTooltip(model, svg);
  if (model.empty) return <EmptyState className="graph-empty" message={model.empty} />;
  const tooltipId = `${id}Tooltip`;
  return <svg ref={svg} id={id} viewBox={model.viewBox} role="img" aria-label={model.label || 'Player statistic graph'}>
    {model.marks.map((mark, index) => <SvgMark key={index} mark={mark} active={tooltip.active === mark} tooltipId={tooltipId}
      onShow={() => tooltip.show(mark)} onHide={tooltip.hide} />)}
    {tooltip.active && <ChartTooltip id={tooltipId} tooltip={tooltip.active.tooltip} />}
  </svg>;
}
