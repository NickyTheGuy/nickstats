import { createRoot } from 'react-dom/client';
import MetricPicker from '../MetricPicker.jsx';
import { createMetricPicker } from '../state/metric-picker.mjs';

const pickers = new Map();
window.NickStatsMetricPickerUI = Object.freeze({
  sync(prefix, axis, config, callbacks) {
    const key = `${prefix}:${axis}`;
    if (!pickers.has(key)) {
      const store = createMetricPicker(callbacks);
      const root = createRoot(document.getElementById(`${prefix}Graph${axis === 'x' ? 'X' : ''}Picker`));
      root.render(<MetricPicker store={store} prefix={prefix} axis={axis} />);
      pickers.set(key, store);
    }
    pickers.get(key).sync(config);
  },
  label(prefix, label) { pickers.get(`${prefix}:y`)?.label(label); }
});
