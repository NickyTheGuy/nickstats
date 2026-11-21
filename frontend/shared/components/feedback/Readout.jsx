export default function Readout({ children, className = '', ...props }) {
  return (
    <output {...props} className={`ui-readout ${className}`}>
      {children}
    </output>
  );
}
