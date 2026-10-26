import ColorKey from '../components/ColorKey.jsx';

export default function GraphLegend({ cards }) {
  return cards.map(card => <ColorKey key={card.id} label={card.label} color={card.color} />);
}
