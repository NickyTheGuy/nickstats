import Button from './Button.jsx';

export default function CloseButton({ label, onClick, className = 'player-open-tab-close' }) {
  return <Button className={className} aria-label={label} onClick={onClick}>×</Button>;
}
