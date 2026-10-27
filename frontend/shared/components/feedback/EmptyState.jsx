export default function EmptyState({ message, className = '' }) {
  return <p className={className}>{message}</p>;
}
