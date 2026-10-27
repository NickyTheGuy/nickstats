import { createRoot } from 'react-dom/client';
import TimelineControls from '../TimelineControls.jsx';

const roots = new WeakMap();
window.NickStatsTimelineControlsUI = Object.freeze({
  render(target, props) {
    if (!roots.has(target)) roots.set(target, createRoot(target));
    roots.get(target).render(<TimelineControls {...props} />);
  }
});
