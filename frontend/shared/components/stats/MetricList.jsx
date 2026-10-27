export default function MetricList({ metrics }) {
  return metrics.map(([label, value, note = '']) => <div key={label} className="player-metric-row">
    <div><span>{label}</span>{note && <small>{note}</small>}</div><strong>{value}</strong>
  </div>);
}
