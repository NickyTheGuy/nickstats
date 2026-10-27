import { tooltipBox } from './state/chart.mjs';

export default function ChartTooltip({ id, tooltip }) {
  const { x, y, width } = tooltipBox(tooltip);
  return <g id={id} className="graph-tooltip" role="tooltip">
    <rect x={x} y={y} width={width} height={28} rx={6} />
    <text x={x + 8} y={y + 18}>{tooltip.label}</text>
  </g>;
}
