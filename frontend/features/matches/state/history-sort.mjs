export const historySortChoices = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['rating-desc', 'Rating: high to low'],
  ['rating-asc', 'Rating: low to high'],
];

function dateValue(match) {
  const value = Number(match.played_at);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function newestFirst(left, right) {
  const a = dateValue(left),
    b = dateValue(right);
  if (a == null || b == null) {
    if (a !== b) return a == null ? 1 : -1;
  } else if (a !== b) return b - a;
  return String(right.id).localeCompare(String(left.id), undefined, { numeric: true });
}

// Score every candidate once, then sort the complete filtered set before paging.
// Missing ratings/dates stay last; ties have a stable newest-first fallback.
export function sortHistoryMatches(matches, order = 'newest', ratingForMatch = () => null) {
  return matches
    .map((match) => ({
      match,
      rating:
        order.startsWith('rating-') && Number(match.rounds) > 0 ? ratingForMatch(match) : null,
    }))
    .sort((left, right) => {
      if (order.startsWith('rating-')) {
        const a = left.rating,
          b = right.rating;
        const missingA = a == null || !Number.isFinite(a);
        const missingB = b == null || !Number.isFinite(b);
        if (missingA !== missingB) return missingA ? 1 : -1;
        if (!missingA && a !== b) return order === 'rating-asc' ? a - b : b - a;
      } else if (order === 'oldest') {
        const a = dateValue(left.match),
          b = dateValue(right.match);
        if (a == null || b == null) {
          if (a !== b) return a == null ? 1 : -1;
        } else if (a !== b) return a - b;
      }
      return newestFirst(left.match, right.match);
    })
    .map(({ match }) => match);
}
