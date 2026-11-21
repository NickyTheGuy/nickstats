// Fullscreen lifecycle is shared by viewer buttons and can be tested without React.
export function createFullscreenController({
  getTarget,
  onChange = () => {},
  document: doc = globalThis.document,
  window: win = globalThis.window,
}) {
  let target = null,
    mode = 'none',
    busy = false,
    disposed = false,
    overflow = null;
  const nativeElement = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
  const getState = () => ({ active: mode !== 'none', mode, busy });
  const publish = () => {
    if (!disposed) onChange(getState());
  };
  function restoreViewport() {
    if (overflow) for (const [element, value] of overflow) element.style.overflow = value;
    overflow = null;
    target?.classList.remove('ui-fullscreen-fallback');
  }
  function clear() {
    restoreViewport();
    target?.classList.remove('ui-fullscreen-target');
    mode = 'none';
    publish();
  }
  function sync() {
    const element = nativeElement(),
      viewer = target || getTarget();
    if (element && element === viewer) {
      target = viewer;
      restoreViewport();
      target.classList.add('ui-fullscreen-target');
      mode = 'native';
      publish();
    } else if (mode === 'native') clear();
  }
  function viewport() {
    if (disposed) return;
    overflow = [doc.body, doc.documentElement]
      .filter(Boolean)
      .map((element) => [element, element.style.overflow]);
    for (const [element] of overflow) element.style.overflow = 'hidden';
    target.classList.add('ui-fullscreen-target', 'ui-fullscreen-fallback');
    mode = 'viewport';
    publish();
  }
  async function exit() {
    if (target && nativeElement() === target) {
      const leave = doc.exitFullscreen || doc.webkitExitFullscreen;
      try {
        await leave?.call(doc);
      } catch {
        /* Keep the active state until native exit succeeds. */
      }
      sync();
    } else clear();
  }
  async function toggle() {
    if (disposed || busy) return;
    if (mode !== 'none') return exit();
    target = getTarget();
    if (!target) return;
    busy = true;
    publish();
    const request = target.requestFullscreen || target.webkitRequestFullscreen;
    try {
      if (request) {
        try {
          await request.call(target);
        } catch {
          /* Use a viewport-sized viewer when native fullscreen is unavailable. */
        }
      }
      if (disposed) {
        if (target && nativeElement() === target) {
          try {
            await (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
          } catch {}
        }
        return;
      }
      if (target && nativeElement() === target) sync();
      else viewport();
    } finally {
      busy = false;
      publish();
    }
  }
  const escape = (event) => {
    if (event.key === 'Escape' && mode === 'viewport') {
      event.preventDefault();
      void exit();
    }
  };
  const navigate = () => {
    if (mode !== 'none') void exit();
  };
  const hidden = () => {
    if (doc.hidden) navigate();
  };
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('webkitfullscreenchange', sync);
  doc.addEventListener('keydown', escape);
  doc.addEventListener('visibilitychange', hidden);
  win.addEventListener('hashchange', navigate);
  return {
    toggle,
    exit,
    getState,
    dispose() {
      disposed = true;
      doc.removeEventListener('fullscreenchange', sync);
      doc.removeEventListener('webkitfullscreenchange', sync);
      doc.removeEventListener('keydown', escape);
      doc.removeEventListener('visibilitychange', hidden);
      win.removeEventListener('hashchange', navigate);
      restoreViewport();
      target?.classList.remove('ui-fullscreen-target');
      mode = 'none';
      if (target && nativeElement() === target)
        Promise.resolve()
          .then(() => (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc))
          .catch(() => {});
    },
  };
}
