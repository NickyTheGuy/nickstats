export default function Button({ type='button', children, className='', align='center', ...props }) {
  return <button type={type} {...props} className={`ui-button ${className}`.trim()} data-align={align}>{children}</button>;
}
