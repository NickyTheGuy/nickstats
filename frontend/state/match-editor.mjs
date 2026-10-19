const listeners = new Set();
let active = null;
export const matchEditorPanels = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => active,
  set(key) {
    if (key === active) return;
    active = key; listeners.forEach(listener => listener());
  }
};
