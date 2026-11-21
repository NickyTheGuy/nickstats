import IconButton from './IconButton.jsx';

export default function CloseButton({ label, onClick, className = 'player-open-tab-close' }) {
  return (
    <IconButton label={label} onClick={onClick} className={className} size={12}>
      <path d="m6 6 12 12M6 18 18 6" />
    </IconButton>
  );
}
