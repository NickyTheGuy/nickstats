import { Fragment } from 'react';
import Button from '../components/buttons/Button.jsx';
import SortHeading from '../components/tables/SortHeading.jsx';

export default function ScoreboardTable({ model, rows, widths, tableId, tableRef, wrapRef, showHeader = true, label, onScroll, toggleGroup, cycleGroup }) {
  const details = model.headings.filter(heading => heading.group).flatMap(heading => heading.columns);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  return <div ref={wrapRef} className={model.wrapClass || "player-profile-table-wrap"} onScroll={onScroll}>
    <table id={tableId} aria-label={label} ref={tableRef} className={model.tableClass} style={{ width: '100%', minWidth: `${totalWidth}px` }}>
      <colgroup>{widths.map((width, index) => <col key={model.columns[index].key} style={{ width: `${width}px` }} />)}</colgroup>
      {showHeader && <thead>
        <tr>
          {model.headings.map((heading, index) => heading.group
            ? <th key={heading.group} className={`demo-toggle-heading demo-group-start demo-group-end ${heading.group}-heading`}
              colSpan={heading.columns.length} data-scoreboard-header={heading.group}>
              <div className="demo-column-heading-actions">
                <Button className="demo-column-toggle" aria-expanded={heading.expanded}
                  onClick={() => toggleGroup(heading.group)}>{heading.title} {heading.expanded ? '▾' : '▸'}</Button>
                {heading.shortcut && <Button className="demo-subgroup-shortcut" data-scoreboard-group={heading.group}
                  title={heading.shortcut} aria-label={heading.shortcut} onClick={event => cycleGroup(heading.group, event.currentTarget)}><span>R</span></Button>}
              </div>
            </th>
            : <Fragment key={`fixed-${index}`}>
              {heading.columns.map(column => <th key={column.key} rowSpan={2} scope="col" className={column.headingClassName} aria-sort={column.ariaSort} title={column.description}>
                <SortHeading column={column} onSort={model.actions.sort} />
              </th>)}
            </Fragment>)}
        </tr>
        <tr>
          {details.map(column => <th key={column.key} scope="col"
            className={`demo-group-detail ${column.group}-cell${column.headingClassName ? ` ${column.headingClassName}` : ''}${column.groupStart ? ' demo-group-start' : ''}${column.groupEnd ? ' demo-group-end' : ''}`}
            aria-sort={column.ariaSort} title={column.description}>
            <SortHeading column={column} onSort={model.actions.sort} />
          </th>)}
        </tr>
      </thead>}
      <tbody>
        {rows.map(row => <tr key={row.id}>
          {row.cells.map((cell, index) => {
            const Cell = index === 0 ? 'th' : 'td';
            return <Cell key={cell.key} scope={index === 0 ? 'row' : undefined} className={cell.className}>{cell.text}{cell.badge && <span className="demo-bot-badge">{cell.badge}</span>}</Cell>;
          })}
        </tr>)}
      </tbody>
    </table>
  </div>;
}
