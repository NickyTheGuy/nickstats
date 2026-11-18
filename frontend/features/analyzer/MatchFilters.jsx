import { useSyncExternalStore } from 'react';
import DateRangeFilter from '../filters/DateRangeFilter.jsx';
import TagFilter from '../filters/TagFilter.jsx';

export default function MatchFilters({dates,tags}) {
  const view=useSyncExternalStore(tags.subscribe,tags.getSnapshot);
  return <div className="analyzer-match-filters">
    <div className="stats-filter date-range-filter"><DateRangeFilter store={dates} target="analyzer" /></div>
    {view.account&&<div className="stats-filter date-range-filter"><TagFilter control={tags} api={window.NickStatsManualFilters} /></div>}
  </div>;
}
