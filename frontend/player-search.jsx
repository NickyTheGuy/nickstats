import { createRoot } from 'react-dom/client';
import PlayerSearch from './search/PlayerSearch.jsx';
import { createPlayerSearch } from './state/player-search.mjs';

window.NickStatsPlayerSearchUI = {
  create({ prefix, onSelect, excluded, initialMessage = '', limit = 25 }) {
    const store = createPlayerSearch({ initialMessage, limit });
    const root = createRoot(document.getElementById(`${prefix}SearchApp`));
    root.render(<PlayerSearch store={store} prefix={prefix} onSelect={onSelect} excluded={excluded} />);
    return { reset: store.reset, status: store.status, destroy() { store.destroy(); root.unmount(); } };
  }
};
