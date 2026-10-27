import SortHeading from './SortHeading.jsx';
import useSortedRows from '../hooks/useSortedRows.js';

export default function DataTable({ headers, rows, sortRows = rows, toggleOff = false, emptyMessage }) {
  const view = useSortedRows(rows, sortRows, toggleOff);
  return <>
    <thead><tr>{headers.map((label, index) => {
      const direction = view.sort?.column === index ? view.sort.direction : null;
      return <th key={index} scope="col" aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <SortHeading toggleOff={toggleOff} column={{ label, direction, index }} onSort={column => view.onSort(column.index)} />
      </th>;
    })}</tr></thead>
    <tbody>{!rows.length && emptyMessage && <tr><td colSpan={headers.length} className="empty">{emptyMessage}</td></tr>}{view.rows.map(({ values, index }) => <tr key={index}>
      {values.map((value, column) => {
        const cell = value && typeof value === 'object' && Object.hasOwn(value, 'text') ? value : { text: value };
        const Cell = column === 0 ? 'th' : 'td';
        return <Cell key={column} scope={column === 0 ? 'row' : undefined} className={cell.className}>{cell.text}</Cell>;
      })}
    </tr>)}</tbody>
  </>;
}
