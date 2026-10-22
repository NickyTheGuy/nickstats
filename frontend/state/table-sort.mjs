export function nextTableSort(sort, column) {
  return { column, direction: sort?.column === column ? (sort.direction === 'asc' ? 'desc' : 'asc') : column === 0 ? 'asc' : 'desc' };
}

// Display cells may contain rounded values, units or color metadata. Sorting uses
// the corresponding raw values and preserves input order when values are equal.
export function sortTableRows(rows, sortRows = rows, sort = null) {
  const indexed = rows.map((values, index) => ({ values, sortValues: sortRows[index] || values, index }));
  if (!sort) return indexed;
  return indexed.sort((left, right) => {
    const a = left.sortValues[sort.column], b = right.sortValues[sort.column];
    const comparison = typeof a === 'number' && typeof b === 'number' ? a - b
      : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    return (sort.direction === 'asc' ? comparison : -comparison) || left.index - right.index;
  });
}
