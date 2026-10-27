export default function FormMessage({ id, children, error = false, className, as: Tag = 'p' }) {
  return <Tag id={id} className={className} role={error ? 'alert' : 'status'} aria-live={error ? undefined : 'polite'} hidden={!children}>{children}</Tag>;
}
