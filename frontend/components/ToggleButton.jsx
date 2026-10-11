import Button from './Button.jsx';

export default function ToggleButton({ selected, className = '', children, ...props }) {
  return <Button {...props} aria-pressed={selected}
    className={[className, selected && 'active'].filter(Boolean).join(' ')}>{children}</Button>;
}
