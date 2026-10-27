export default function SummaryCard({ label, lines, color, className = 'graph-summary-card' }) {
  return <div className={className} style={{ '--series-color': color }}>
    <strong>{label}</strong>{lines.map((line, index) => <span key={index}>{line}</span>)}
  </div>;
}
