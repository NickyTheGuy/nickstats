import Button from './Button.jsx';

export default function SortHeading({ column, onSort }) {
  return <Button className={`player-table-sort-button${column.direction ? ' active' : ''}`}
    data-direction={column.direction || undefined} onClick={() => onSort(column)}>{column.label}</Button>;
}
