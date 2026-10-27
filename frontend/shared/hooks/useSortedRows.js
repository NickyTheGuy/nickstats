import { useMemo, useState } from 'react';
import { nextTableSort, sortTableRows } from '../state/table-sort.mjs';

export default function useSortedRows(rows, sortRows, toggleOff = false) {
  const [sort, setSort] = useState(null);
  const sorted = useMemo(() => sortTableRows(rows, sortRows, sort), [rows, sortRows, sort]);
  return { sort, rows: sorted, onSort: column => setSort(current => nextTableSort(current, column, toggleOff)) };
}
