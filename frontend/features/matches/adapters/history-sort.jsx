import { createRoot } from 'react-dom/client';
import OptionField from '../../../shared/components/forms/OptionField.jsx';
import { historySortChoices, sortHistoryMatches } from '../state/history-sort.mjs';

window.NickStatsMatchHistory = {
  sort: sortHistoryMatches,
  create(target, onChange) {
    const root = createRoot(document.getElementById(target));
    let value = 'newest';
    const render = () =>
      root.render(
        <OptionField
          label="Sort matches"
          className="filter-field"
          options={historySortChoices}
          value={value}
          onChange={(next) => {
            value = next;
            render();
            onChange(next);
          }}
        />,
      );
    render();
    return {
      reset() {
        value = 'newest';
        render();
      },
    };
  },
};
