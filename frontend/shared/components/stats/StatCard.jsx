export default function StatCard({ label, value, note = '', className = '' }) {
  return <div className={`player-stat-card ${className}`.trim()}>
    <span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}
  </div>;
}
