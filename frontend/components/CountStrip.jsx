export default function CountStrip({ metrics }) {
  return metrics.map(([label, value, note = '']) => <div key={label} className="player-count-item">
    <strong>{value}</strong><span>{label}</span>{note && <small>{note}</small>}
  </div>);
}
