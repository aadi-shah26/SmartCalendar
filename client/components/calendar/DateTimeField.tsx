import { joinDateTime, splitDateTime, toDateKey } from '../../lib/calendar/dates';
import { inputStyle } from './styles';
import TimePicker from './TimePicker';

/**
 * A "YYYY-MM-DDTHH:MM" value edited as a date input plus a time picker. Picking only a date
 * fills in `defaultTime`; picking only a time assumes today.
 */
export default function DateTimeField({ value, onChange, defaultTime }: {
  value: string; onChange: (v: string) => void; defaultTime: string;
}) {
  const { date, time } = splitDateTime(value);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 6 }}>
      <input
        type="date"
        value={date}
        onChange={e => onChange(joinDateTime(e.target.value, time || defaultTime))}
        style={inputStyle}
      />
      <TimePicker value={time} onChange={t => onChange(joinDateTime(date || toDateKey(new Date()), t))} />
    </div>
  );
}
