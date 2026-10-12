import { useSyncExternalStore } from 'react';
import Button from '../components/Button.jsx';
import Calendar from '../components/Calendar.jsx';
import Dropdown from '../components/Dropdown.jsx';

const display = value => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
export default function DateRangeFilter({ store, target }) {
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const selection = !view.draftFrom ? 'Choose a start date' : view.draftThrough
    ? `${display(view.draftFrom)} through ${display(view.draftThrough)}` : `Start: ${display(view.draftFrom)} · Choose an end date`;
  return <>
    <span className="date-range-label">Dates</span>
    <Dropdown summary={view.summary} className="date-range-menu" open={view.openTarget === target}
      onOpenChange={open => { if (open) store.open(target); else if (store.openTarget === target) store.closeMenus(); }}>
      {view.openTarget === target && <div className="date-range-panel">
        <p className="date-range-help">Choose a start and end date. Click the same date twice for one day.</p>
        <p className="date-range-selection" aria-live="polite">{selection}</p>
        <div className={`date-range-calendars${view.calendars.length === 1 ? ' single-month' : ''}`}>
          {view.calendars.map(calendar => <Calendar key={calendar.index} calendar={calendar}
            onMove={(index, amount) => store.moveCalendar(index, amount)} onMonth={(index, value) => store.setCalendarMonth(index, value)} onDay={value => store.selectDay(value)} />)}
        </div>
        <div className="date-range-actions">
          <Button className="date-range-clear" onClick={() => { store.reset({ notify: true }); store.closeMenus(); }}>Clear</Button>
          <Button className="date-range-apply" disabled={!view.draftFrom || !view.draftThrough} onClick={() => store.apply()}>Apply range</Button>
        </div>
      </div>}
    </Dropdown>
  </>;
}
