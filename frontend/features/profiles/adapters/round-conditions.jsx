import { createRoot } from 'react-dom/client';
import RoundConditionFilter from '../RoundConditionFilter.jsx';
import * as conditions from '../state/round-conditions.mjs';
import { createRoundConditionsClient } from '../state/round-conditions-client.mjs';
window.NickStatsRoundConditions = Object.freeze(conditions);
window.NickStatsRoundConditionData = createRoundConditionsClient((...args) => fetch(...args));
window.addEventListener('nickstats:matches-changed', () =>
  window.NickStatsRoundConditionData.invalidate(),
);
window.NickStatsRoundConditionsUI = {
  create(target, actions) {
    const root = createRoot(document.getElementById(target));
    let props = { value: 'ALL', ...actions };
    const render = () => root.render(<RoundConditionFilter {...props} />);
    render();
    return {
      update(next) {
        props = { ...props, ...next };
        render();
      },
    };
  },
};
