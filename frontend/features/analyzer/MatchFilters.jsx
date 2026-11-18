import DateRangeFilter from '../filters/DateRangeFilter.jsx';
import TagFilter from '../filters/TagFilter.jsx';

export default function MatchFilters({dates,tags}) {
  return <div className="analyzer-match-filters">
    <div className="stats-filter date-range-filter"><DateRangeFilter store={dates} target="analyzer" /></div>
    <div className="stats-filter date-range-filter"><TagFilter control={tags} api={window.NickStatsManualFilters} /></div>
  </div>;
}
