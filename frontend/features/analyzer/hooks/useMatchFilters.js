import { useEffect, useState } from 'react';
import { DateRangeStore } from '../../filters/state/date-range.mjs';
import { createTagFilterStore } from '../../filters/state/tag-filter.mjs';

export default function useMatchFilters(saved) {
  const [revision, bump] = useState(0);
  const [dates] = useState(() => {
    const dates = new DateRangeStore({ onChange: () => bump((v) => v + 1) });
    dates.from = saved?.date?.from || '';
    dates.through = saved?.date?.through || '';
    dates.closeMenus();
    return dates;
  });
  const [tags] = useState(() =>
    createTagFilterStore(window.NickStatsManualFilters, { onChange: () => bump((v) => v + 1) }),
  );
  useEffect(
    () => () => {
      dates.destroy();
      tags.destroy();
    },
    [],
  );
  return { dates, tags, revision };
}
