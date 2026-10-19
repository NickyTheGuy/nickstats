import { previewStats } from '../state/match-card.mjs';

export default function StatPreview({ stats, className = '' }) {
  const rating = Number(stats.rating);
  const ratingClass = `demo-rating ${rating >= 1.10 ? 'rating-good' : rating <= 0.90 ? 'rating-bad' : 'rating-average'}`;
  return <span className={`match-list-preview ${className}`}>
    {previewStats(stats).map(([label, value]) => <span key={label} className="match-list-preview-stat">
      <span>{label}</span><strong className={label === 'Rating' ? ratingClass : undefined}>{value}</strong>
    </span>)}
  </span>;
}
