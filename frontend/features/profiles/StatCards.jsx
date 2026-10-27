import StatCard from '../../shared/components/stats/StatCard.jsx';

export default function StatCards({ cards }) {
  return cards.map(([label, value, note, className]) => <StatCard key={label} label={label} value={value} note={note} className={className} />);
}
