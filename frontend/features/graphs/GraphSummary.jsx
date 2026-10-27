import SummaryCard from '../../shared/components/stats/SummaryCard.jsx';
import EmptyState from '../../shared/components/feedback/EmptyState.jsx';

export default function GraphSummary({ model }) {
  return model.empty ? <EmptyState className="graph-empty" message={model.empty} />
    : model.cards.map(card => <SummaryCard key={card.id} {...card} />);
}
