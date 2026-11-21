import IconButton from './IconButton.jsx';
import useFullscreen from '../../hooks/useFullscreen.js';

export default function FullscreenButton({ getTarget, className = '' }) {
  const { active, busy, toggle } = useFullscreen(getTarget);
  return (
    <IconButton
      controlSize={42}
      label={active ? 'Exit fullscreen' : 'Enter fullscreen'}
      className={className}
      aria-pressed={active}
      disabled={busy}
      onClick={toggle}
    >
      <path
        d={
          active
            ? 'M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5'
            : 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'
        }
      />
    </IconButton>
  );
}
