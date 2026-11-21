import Button from './Button.jsx';

export default function IconButton({
  label,
  children,
  size = 18,
  controlSize,
  className = '',
  style,
  ...props
}) {
  const dimensions =
    controlSize == null
      ? {}
      : {
          '--icon-button-size': typeof controlSize === 'number' ? `${controlSize}px` : controlSize,
        };
  return (
    <Button
      {...props}
      className={`ui-icon-button ${className}`}
      data-control-size={controlSize}
      style={{ ...dimensions, ...style }}
      aria-label={label}
      title={props.title || label}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {children}
      </svg>
    </Button>
  );
}
