import SummaryCard from '../components/SummaryCard.jsx';
import EmptyState from '../components/EmptyState.jsx';

export default function GraphSummary({ model }) {
  return model.empty ? <EmptyState className="graph-empty" message={model.empty} />
    : model.cards.map(card => <SummaryCard key={card.id} {...card} />);
}
