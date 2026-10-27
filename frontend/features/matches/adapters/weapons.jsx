import { createRoot } from 'react-dom/client';
import WeaponBreakdown from '../WeaponBreakdown.jsx';

const roots = new WeakMap();
window.NickStatsWeaponUI = Object.freeze({
  render(target, teams, resetKey) {
    if (!roots.has(target)) roots.set(target, createRoot(target));
    roots.get(target).render(<WeaponBreakdown key={resetKey} teams={teams} />);
  }
});
