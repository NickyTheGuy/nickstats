import { useEffect, useRef, useState } from 'react';
import { createFullscreenController } from '../state/fullscreen.mjs';

export default function useFullscreen(getTarget) {
  const getter = useRef(getTarget),
    controller = useRef(null);
  const [state, setState] = useState({ active: false, mode: 'none', busy: false });
  getter.current = getTarget;
  useEffect(() => {
    controller.current = createFullscreenController({
      getTarget: () => getter.current(),
      onChange: setState,
    });
    return () => controller.current.dispose();
  }, []);
  return { ...state, toggle: () => controller.current?.toggle() };
}
