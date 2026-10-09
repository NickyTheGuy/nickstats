export default function SortHeading({ column, onSort }) {
  return <button type="button" className={`player-table-sort-button${column.direction ? ' active' : ''}`}
    data-direction={column.direction || undefined} onClick={() => onSort(column)}>{column.label}</button>;
}
