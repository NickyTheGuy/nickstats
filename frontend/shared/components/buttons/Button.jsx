export default function Button({ type = 'button', children, ...props }) {
  return <button type={type} {...props}>{children}</button>;
}
