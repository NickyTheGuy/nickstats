import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ScoreboardTable from './ScoreboardTable.jsx';

export default function Scoreboard({ model, tableId }) {
  const table = useRef(null);
  const pendingScroll = useRef(null);
  const wraps = useRef([]);
  const [measurement, setMeasurement] = useState({ model: null, widths: [] });
  const widths = measurement.model === model ? measurement.widths : model.columns.map(column => column.minimumWidth);
  const teams = model.teams || [{ rows: model.rows }];
  function synchronizeScroll(source) {
    for (const wrap of wraps.current) if (wrap && wrap !== source && wrap.scrollLeft !== source.scrollLeft) wrap.scrollLeft = source.scrollLeft;
  }

  // Measure after React commits the content, before painting wide/long-name tables.
  useLayoutEffect(() => {
    const node = table.current;
    if (!node) return;
    const copy = node.cloneNode(true);
    copy.removeAttribute('id');
    // Measure every team against the same headers so both tables align.
    for (const wrap of wraps.current.slice(1)) {
      for (const row of wrap?.querySelectorAll('tbody tr') || []) copy.tBodies[0].appendChild(row.cloneNode(true));
    }
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
    const wrap = wraps.current[0];
    if (pending.viewportX != null) {
      wrap.scrollLeft = pending.scrollLeft;
      const button = table.current.querySelector(`[data-scoreboard-group="${pending.group}"]`);
      if (button) wrap.scrollLeft += button.getBoundingClientRect().left + button.offsetWidth / 2 - pending.viewportX;
    } else {
      const left = window.NickStatsScoreboard.scrollGroupIntoView(wrap, table.current, pending.group);
      if (left != null) wrap.scrollLeft = left;
    }
    synchronizeScroll(wrap);
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

  return teams.map((team, index) => {
    const content = <ScoreboardTable key={`table-${index}`} model={model} rows={team.rows} widths={widths} tableId={index === 0 ? tableId : undefined}
      tableRef={index === 0 ? table : undefined} wrapRef={node => { wraps.current[index] = node; }} showHeader={index === 0}
      label={team.label} onScroll={event => synchronizeScroll(event.currentTarget)} toggleGroup={toggleGroup} cycleGroup={cycleGroup} />;
    return model.teams ? <section key={team.id} className="demo-team">
      <div className="demo-team-head"><h3>{team.name}</h3><span className={`demo-team-score${team.outcome ? ` score-${team.outcome}` : ''}`}>{team.score}</span></div>
      {content}
    </section> : content;
  });
}
