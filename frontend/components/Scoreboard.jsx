import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import SortHeading from './SortHeading.jsx';

export default function Scoreboard({ model, tableId }) {
  const table = useRef(null);
  const pendingScroll = useRef(null);
  const [measurement, setMeasurement] = useState({ model: null, widths: [] });
  const widths = measurement.model === model ? measurement.widths : model.columns.map(column => column.minimumWidth);
  const details = model.headings.filter(heading => heading.group).flatMap(heading => heading.columns);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);

  // Measure after React commits the content, before painting wide/long-name tables.
  useLayoutEffect(() => {
    const node = table.current;
    const copy = node.cloneNode(true);
    copy.removeAttribute('id');
    copy.setAttribute('aria-hidden', 'true');
    Object.assign(copy.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', width: 'auto', minWidth: '0', tableLayout: 'auto' });
    document.body.appendChild(copy);
    try {
      const headers = [...copy.tHead.rows[0].cells].filter(cell => cell.rowSpan === 2).concat([...copy.tHead.rows[1].cells]);
      const measured = model.columns.map((column, index) => Math.ceil(Math.max(column.minimumWidth, headers[index]?.getBoundingClientRect().width || 0,
        ...[...copy.tBodies[0].rows].map(row => row.cells[index].getBoundingClientRect().width))));
      setMeasurement({ model, widths: measured });
    } finally { copy.remove(); }
  }, [model]);

  useLayoutEffect(() => {
    const pending = pendingScroll.current;
    if (!pending || measurement.model !== model) return;
    pendingScroll.current = null;
    const wrap = table.current.parentElement;
    if (pending.viewportX != null) {
      wrap.scrollLeft = pending.scrollLeft;
      const button = table.current.querySelector(`[data-scoreboard-group="${pending.group}"]`);
      if (button) wrap.scrollLeft += button.getBoundingClientRect().left + button.offsetWidth / 2 - pending.viewportX;
    } else {
      const left = window.NickStatsScoreboard.scrollGroupIntoView(wrap, table.current, pending.group);
      if (left != null) wrap.scrollLeft = left;
    }
  }, [model, measurement]);

  function toggleGroup(group) {
    pendingScroll.current = { group };
    model.actions.toggle(group);
  }
  function cycleGroup(group, button) {
    pendingScroll.current = { group, viewportX: button.getBoundingClientRect().left + button.offsetWidth / 2,
      scrollLeft: table.current.parentElement.scrollLeft };
    model.actions.cycle(group);
  }

  useEffect(() => {
    function handleDetailShortcut(event) {
      if (event.key?.toLowerCase() !== 'r' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!table.current?.getClientRects().length) return;
      const shortcut = table.current.querySelector('[data-scoreboard-group]');
      if (!shortcut) return;
      event.preventDefault();
      cycleGroup(shortcut.dataset.scoreboardGroup, shortcut);
    }
    document.addEventListener('keydown', handleDetailShortcut);
    return () => document.removeEventListener('keydown', handleDetailShortcut);
  }, [model]);

  return <div className="player-profile-table-wrap">
    <table id={tableId} ref={table} className={model.tableClass} style={{ width: '100%', minWidth: `${totalWidth}px` }}>
      <colgroup>{widths.map((width, index) => <col key={model.columns[index].key} style={{ width: `${width}px` }} />)}</colgroup>
      <thead>
        <tr>
          {model.headings.map((heading, index) => heading.group
            ? <th key={heading.group} className={`demo-toggle-heading demo-group-start demo-group-end ${heading.group}-heading`}
              colSpan={heading.columns.length} data-scoreboard-header={heading.group}>
              <div className="demo-column-heading-actions">
                <button type="button" className="demo-column-toggle" aria-expanded={heading.expanded}
                  onClick={() => toggleGroup(heading.group)}>{heading.title} {heading.expanded ? '▾' : '▸'}</button>
                {heading.shortcut && <button type="button" className="demo-subgroup-shortcut" data-scoreboard-group={heading.group}
                  title={heading.shortcut} aria-label={heading.shortcut} onClick={event => cycleGroup(heading.group, event.currentTarget)}><span>R</span></button>}
              </div>
            </th>
            : <Fragment key={`fixed-${index}`}>
              {heading.columns.map(column => <th key={column.key} rowSpan={2} scope="col" aria-sort={column.ariaSort} title={column.description}>
                <SortHeading column={column} onSort={model.actions.sort} />
              </th>)}
            </Fragment>)}
        </tr>
        <tr>
          {details.map(column => <th key={column.key} scope="col"
            className={`demo-group-detail ${column.group}-cell${column.groupStart ? ' demo-group-start' : ''}${column.groupEnd ? ' demo-group-end' : ''}`}
            aria-sort={column.ariaSort} title={column.description}>
            <SortHeading column={column} onSort={model.actions.sort} />
          </th>)}
        </tr>
      </thead>
      <tbody>
        {model.rows.map(row => <tr key={row.id}>
          {row.cells.map((cell, index) => {
            const Cell = index === 0 ? 'th' : 'td';
            return <Cell key={cell.key} scope={index === 0 ? 'row' : undefined} className={cell.className}>{cell.text}</Cell>;
          })}
        </tr>)}
      </tbody>
    </table>
  </div>;
}
