import { Children, useLayoutEffect, useRef, useState } from 'react';
import useRememberedState from '../../hooks/useRememberedState.js';

export default function ResizableSplit({
  children,
  orientation = 'auto',
  label = 'Panel split',
  className = '',
  preferenceKey = null,
}) {
  const host = useRef(null),
    drag = useRef(null);
  const [width, setWidth] = useState(0),
    [share, setShare] = useRememberedState(preferenceKey, 50, (value) =>
      Number.isFinite(value) ? Math.max(10, Math.min(90, value)) : 50,
    );
  useLayoutEffect(() => {
    setWidth(host.current.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const columns = orientation === 'columns' || (orientation === 'auto' && width > 650);
  const panels = Children.toArray(children),
    clamp = (value) => Math.max(10, Math.min(90, value));
  const sizes = `minmax(0,${share}fr) 8px minmax(0,${100 - share}fr)`;
  function move(event) {
    if (!drag.current) return;
    const box = host.current.getBoundingClientRect();
    const fraction = columns
      ? (event.clientX - box.left) / box.width
      : (event.clientY - box.top) / box.height;
    setShare(clamp(fraction * 100));
  }
  return (
    <div
      ref={host}
      className={`resizable-split ${columns ? 'split-columns' : 'split-rows'} ${className}`}
      style={
        panels.length === 2
          ? {
              gridTemplateColumns: columns ? sizes : 'minmax(0,1fr)',
              gridTemplateRows: columns ? 'minmax(0,1fr)' : sizes,
            }
          : undefined
      }
    >
      {panels[0]}
      {panels.length === 2 && (
        <div
          className="split-divider"
          role="separator"
          tabIndex={0}
          aria-label={label}
          aria-orientation={columns ? 'vertical' : 'horizontal'}
          aria-valuemin={10}
          aria-valuemax={90}
          aria-valuenow={Math.round(share)}
          title="Drag to resize levels. Double-click to reset."
          onDoubleClick={() => setShare(50)}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            drag.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={move}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            const delta = columns
              ? { ArrowLeft: -5, ArrowRight: 5 }
              : { ArrowUp: -5, ArrowDown: 5 };
            if (event.key in delta) {
              event.preventDefault();
              setShare((value) => clamp(value + delta[event.key]));
            } else if (['Home', 'End', 'Enter'].includes(event.key)) {
              event.preventDefault();
              setShare(event.key === 'Home' ? 10 : event.key === 'End' ? 90 : 50);
            }
          }}
        />
      )}
      {panels.slice(1)}
    </div>
  );
}
