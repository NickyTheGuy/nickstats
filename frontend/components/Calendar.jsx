import Button from './Button.jsx';
import OptionDropdown from './OptionDropdown.jsx';

export default function Calendar({ calendar, onMove, onMonth, onDay }) {
  const { index } = calendar;
  return <div className="date-range-calendar">
    <div className="date-range-navigation">
      <Button className="date-range-previous" disabled={calendar.previousDisabled} aria-label={`Previous month for calendar ${index + 1}`} onClick={() => onMove(index, -1)}>‹</Button>
      <OptionDropdown className="date-range-month-picker" label={`Month for calendar ${index + 1}`} options={calendar.months} value={calendar.value} onChange={value => onMonth(index, value)} />
      <Button className="date-range-next" disabled={calendar.nextDisabled} aria-label={`Next month for calendar ${index + 1}`} onClick={() => onMove(index, 1)}>›</Button>
    </div>
    <div className="date-range-grid">
      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} className="date-range-weekday">{day}</span>)}
      {Array.from({ length: calendar.offset }, (_, index) => <span key={`offset-${index}`} />)}
      {calendar.days.map(day => <Button key={day.value} data-date={day.value} aria-label={day.label} disabled={day.disabled}
        aria-pressed={day.selected} className={`date-range-day${day.selected ? ' selected' : ''}${day.withinRange ? ' within-range' : ''}`}
        onClick={() => onDay(day.value)}>{day.day}</Button>)}
    </div>
  </div>;
}
