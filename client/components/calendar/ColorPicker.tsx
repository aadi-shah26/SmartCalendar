import { PASTEL_COLORS } from '../../lib/calendar/colors';

export default function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {PASTEL_COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} style={{
          width: 26, height: 26, borderRadius: '50%', backgroundColor: c,
          border: value === c ? '3px solid #555' : '2px solid #ddd',
          cursor: 'pointer', padding: 0,
          boxShadow: value === c ? 'inset 0 0 0 2px #fff' : 'none',
        }} />
      ))}
    </div>
  );
}
