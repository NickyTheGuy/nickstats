import Button from './Button.jsx';

export default function SortHeading({ column, onSort, toggleOff = false }) {
  return <Button className={`player-table-sort-button${column.direction ? ' active' : ''}`}
    data-direction={column.direction || undefined}
    title={column.direction && toggleOff ? 'Return to the original order' : column.direction ? `Sorted ${column.direction === 'asc' ? 'ascending' : 'descending'}; click to reverse` : `Sort by ${column.label}`} onClick={() => onSort(column)}>{column.label}</Button>;
}
