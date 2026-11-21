import { MAX_REPLAY_BYTES, validateReplay } from './replay.mjs';

export async function openReplayFile(file, { signal, onStatus = () => {} }) {
  if (/\.json$/i.test(file.name)) {
    if (file.size > MAX_REPLAY_BYTES) throw new Error('Replay JSON is too large (128 MB maximum).');
    onStatus('Reading replay…');
    const data = JSON.parse(await file.text());
    signal.throwIfAborted();
    return validateReplay(data);
  }
  if (!/\.dem(?:\.zst)?$/i.test(file.name))
    throw new Error('Choose a .dem, .dem.zst, or replay JSON file.');
  if (file.size > 768 * 1024 * 1024) throw new Error('Demo is too large (768 MB maximum).');
  onStatus('Reading demo locally…');
  const data = await file.arrayBuffer();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker('./js/demo-worker.js?v=20261118-9');
    const finish = (error, replay) => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve(replay);
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => finish(new Error(event.message || 'The demo worker stopped.'));
    worker.onmessage = ({ data: message }) => {
      if (message.type === 'ready') {
        onStatus('Parsing demo and capturing movement locally…');
        worker.postMessage(
          {
            type: 'parse',
            name: file.name,
            data,
            compression: /\.zst$/i.test(file.name) ? 'zstd' : null,
            captureReplay: true,
          },
          [data],
        );
      } else if (message.type === 'status') onStatus(message.message);
      else if (message.type === 'error') finish(new Error(message.message));
      else if (message.type === 'result') {
        try {
          finish(null, validateReplay(message.replay));
        } catch (error) {
          finish(error);
        }
      }
    };
    if (signal.aborted) abort();
  });
}

export function downloadReplay(replay) {
  const blob = new Blob([JSON.stringify(replay)], { type: 'application/json' });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = `${replay.source_file.replace(/\.dem(?:\.zst)?$/i, '').replace(/[^a-z0-9_.-]/gi, '_')}.replay.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
