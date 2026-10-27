const initialState = () => ({
  selected: false, fileLabel: 'Choose one or more demos', parseLabel: 'Parse match',
  busy: false, uploading: false, batchRunning: false, retry: false, replace: false, download: false,
  diagnostics: false, status: 'Choose one or more demo files.', error: false,
  items: [], completed: 0, total: 0, saved: 0, failed: 0, summary: '0 of 0 complete', resetKey: 0
});

export function createUploadStore() {
  let snapshot = initialState();
  const listeners = new Set();
  const update = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  function queue(files) {
    return { items: files.map((file, index) => ({ index, name: file.name, state: 'waiting', detail: 'Waiting' })),
      completed: 0, total: files.length, saved: 0, failed: 0, summary: `0 of ${files.length} complete` };
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update,
    status(status, error = false) { update({ status, error }); },
    select(files, fileLabel) {
      update({ ...queue(files), selected: true, fileLabel, parseLabel: files.length === 1 ? 'Parse match' : `Parse ${files.length} matches`,
        retry: false, replace: false, download: false, diagnostics: false });
    },
    queue(files) { update(queue(files)); },
    item(index, state, detail) { update({ items: snapshot.items.map(item => item.index === index ? { ...item, state, detail } : item) }); },
    progress(completed, total, saved, failed) {
      update({ completed, total, saved, failed, summary: completed === total ? `${saved} saved · ${failed} failed` : `${completed} of ${total} complete` });
    },
    reset() { update({ ...initialState(), resetKey: snapshot.resetKey + 1 }); }
  };
}
