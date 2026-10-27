export default function ProgressBar({ id, value, max, label, className }) {
  const percent = max ? Math.min(100, Math.max(0, 100 * value / max)) : 0;
  return <div className={className} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max || 1} aria-valuenow={value}>
    <span id={id} style={{ width: `${percent}%` }} />
  </div>;
}
