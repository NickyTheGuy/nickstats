export default function ColorKey({ label, color, className = 'graph-legend-item' }) {
  return <span className={className} style={{ '--series-color': color }}>{label}</span>;
}
