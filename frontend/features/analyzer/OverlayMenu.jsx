import { useId } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
export default function OverlayMenu({buttonLabel,label,open,onToggle,children}) {
  const id=useId();
  return <div className={`analyzer-controls${open?' is-open':''}`}>
    <Button className="button button-secondary analyzer-controls-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>{buttonLabel} {open?'▴':'▾'}</Button>
    {open&&<aside id={id} className="analyzer-control-panel" aria-label={label}>{children}</aside>}
  </div>;
}
