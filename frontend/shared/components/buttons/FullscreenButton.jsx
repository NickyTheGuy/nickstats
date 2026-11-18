import IconButton from './IconButton.jsx';
import useFullscreen from '../../hooks/useFullscreen.js';

export default function FullscreenButton({getTarget,className=''}) {
  const {active,busy,toggle}=useFullscreen(getTarget);
  return <IconButton label={active?'Exit fullscreen':'Enter fullscreen'} className={className}
    aria-pressed={active} disabled={busy} onClick={toggle}>
    <path d={active?'M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6':'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6'} />
  </IconButton>;
}
