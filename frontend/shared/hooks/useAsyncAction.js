import { useEffect, useRef, useState } from 'react';

// Keep one submission in flight and ignore component state updates after closing.
export default function useAsyncAction() {
  const [state, setState] = useState({ busy: false, error: '' });
  const locked = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(action, onSuccess = () => {}) {
    if (locked.current) return;
    locked.current = true;
    setState({ busy: true, error: '' });
    try {
      const result = await action();
      if (mounted.current) onSuccess(result);
    } catch (error) {
      if (mounted.current) setState({ busy: false, error: error.message || 'The request could not be completed.' });
    } finally {
      locked.current = false;
      if (mounted.current) setState(current => ({ ...current, busy: false }));
    }
  }
  return { ...state, run };
}
