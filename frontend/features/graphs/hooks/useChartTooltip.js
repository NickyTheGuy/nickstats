import { useEffect, useState } from 'react';

export default function useChartTooltip(model, svg) {
  const [selection, setSelection] = useState(null);
  // A redraw invalidates the previous tooltip, even when a mark index is reused.
  const active = selection?.model === model ? selection.mark : null;
  const hide = () => setSelection(null);
  useEffect(() => {
    const outside = event => { if (!svg.current?.contains(event.target)) setSelection(null); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [svg]);
  return { active, hide, show: mark => setSelection({ model, mark }) };
}
