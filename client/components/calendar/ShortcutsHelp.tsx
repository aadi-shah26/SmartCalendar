'use client';
import { SHORTCUTS } from '../../lib/calendar/shortcuts';

const keyCap: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 24, padding: '0 6px',
  borderRadius: 6, border: '1px solid #ddd', borderBottomWidth: 2, background: '#fafafa',
  fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#333',
};

/** The list of keyboard shortcuts, opened with "?" or from the profile menu. */
export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div role="dialog" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}
        style={{ backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Keyboard shortcuts</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {SHORTCUTS.map(({ keys, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: '1px solid #f2f2f2', fontSize: 13 }}>
            <span style={{ color: '#333' }}>{label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, color: '#aaa', fontSize: 11 }}>
              {keys.map((k, i) => (
                <span key={k} style={{ display: 'contents' }}>
                  {i > 0 && 'or'}
                  <kbd style={keyCap}>{k}</kbd>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
