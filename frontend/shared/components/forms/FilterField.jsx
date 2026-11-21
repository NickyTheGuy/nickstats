export default function FilterField({ label, children, className = '' }) {
  return (
    <div className={`filter-field ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </div>
  );
}
