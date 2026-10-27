export default function StatSection({ number, title, className = '', children }) {
  return <section className={`player-stat-section${className ? ` ${className}` : ''}`}>
    <header><span>{number}</span><div><h3>{title}</h3></div></header>
    {children}
  </section>;
}
