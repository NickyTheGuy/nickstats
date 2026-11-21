import SortHeading from './SortHeading.jsx';
import useSortedRows from '../../hooks/useSortedRows.js';
import { useState } from 'react';
import Pagination from '../navigation/Pagination.jsx';

export default function DataTable({
  headers,
  rows,
  sortRows = rows,
  toggleOff = false,
  emptyMessage,
  pageSize = 0,
  rowLabel = 'rows',
  sortable = true,
}) {
  const view = useSortedRows(rows, sortRows, toggleOff);
  const [page, setPage] = useState(0);
  const pages = pageSize ? Math.max(1, Math.ceil(view.rows.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1),
    offset = current * pageSize;
  const visible = pageSize ? view.rows.slice(offset, offset + pageSize) : view.rows;
  return (
    <>
      <thead>
        <tr>
          {headers.map((label, index) => {
            const direction = view.sort?.column === index ? view.sort.direction : null;
            return (
              <th
                key={index}
                scope="col"
                aria-sort={
                  sortable && direction
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : sortable
                      ? 'none'
                      : undefined
                }
              >
                {sortable ? (
                  <SortHeading
                    toggleOff={toggleOff}
                    column={{ label, direction, index }}
                    onSort={(column) => {
                      setPage(0);
                      view.onSort(column.index);
                    }}
                  />
                ) : (
                  label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {!rows.length && emptyMessage && (
          <tr>
            <td colSpan={headers.length} className="empty">
              {emptyMessage}
            </td>
          </tr>
        )}
        {visible.map(({ values, index }) => (
          <tr key={index}>
            {values.map((value, column) => {
              const cell =
                value && typeof value === 'object' && Object.hasOwn(value, 'text')
                  ? value
                  : { text: value };
              const Cell = column === 0 ? 'th' : 'td';
              return (
                <Cell
                  key={column}
                  scope={column === 0 ? 'row' : undefined}
                  className={cell.className}
                >
                  {cell.text}
                </Cell>
              );
            })}
          </tr>
        ))}
      </tbody>
      {pages > 1 && (
        <tfoot>
          <tr>
            <td colSpan={headers.length}>
              <Pagination
                className="table-pagination"
                hidden={false}
                text={`${offset + 1}–${Math.min(offset + pageSize, rows.length)} of ${rows.length} ${rowLabel}`}
                previousDisabled={current === 0}
                nextDisabled={current === pages - 1}
                onPrevious={() => setPage(current - 1)}
                onNext={() => setPage(current + 1)}
              />
            </td>
          </tr>
        </tfoot>
      )}
    </>
  );
}
