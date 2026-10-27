export default function FormMessage({ id, children, error = false, className }) {
  return <p id={id} className={className} role={error ? 'alert' : 'status'} aria-live={error ? undefined : 'polite'} hidden={!children}>{children}</p>;
}
