// A matrix preserves row/column alignment rather than sorting individual columns.
export default function MatrixTable({ label, corner, columns, rows, className, wrapperClassName }) {
  return <div className={wrapperClassName}>
    <table className={className} aria-label={label}>
      <thead><tr><th scope="col" className={corner.className} title={corner.title}>{corner.text}</th>
        {columns.map(column => <th key={column.key} scope="col" className={column.className} title={column.title}>{column.text}</th>)}
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.key} className={row.className}>
        <th scope="row" title={row.title}>{row.text}</th>
        {row.cells.map((cell, index) => <td key={columns[index].key} className={cell.className} title={cell.title}>{cell.text}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
