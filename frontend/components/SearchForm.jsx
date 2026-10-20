import Button from './Button.jsx';

export default function SearchForm({ prefix, query, onChange, onSubmit, submitLabel = 'Search', primary = false }) {
  return <form className={`${prefix}-search-form`} id={`${prefix}SearchForm`} role="search"
    onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <label className="visually-hidden" htmlFor={`${prefix}SearchInput`}>Player name or Steam ID</label>
    <input id={`${prefix}SearchInput`} type="search" placeholder="Name or Steam ID" autoComplete="off" spellCheck={false}
      value={query} onChange={event => onChange(event.target.value)} />
    <Button type="submit" className={`button button-${primary ? 'primary' : 'secondary'}`}>{submitLabel}</Button>
  </form>;
}
