import type { CSSProperties } from 'react';
import { THEME_COLOR } from '../../lib/calendar/colors';

export const overlay: CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
};
export const modal: CSSProperties = {
  backgroundColor: '#fff', borderRadius: 20, padding: 28,
  width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
};
export const labelStyle: CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#888',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, marginTop: 14
};
export const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e5e5',
  fontSize: 14, outline: 'none', boxSizing: 'border-box', backgroundColor: '#fafafa'
};
export const saveBtnStyle: CSSProperties = {
  flex: 1, padding: '12px', borderRadius: 12, border: 'none',
  backgroundColor: THEME_COLOR, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer'
};
export const cancelBtnStyle: CSSProperties = {
  flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #e5e5e5',
  backgroundColor: '#fff', color: '#1a1a1a', fontWeight: 600, fontSize: 14, cursor: 'pointer'
};
export const deleteBtnStyle: CSSProperties = { ...cancelBtnStyle, color: '#e53e3e', borderColor: '#e53e3e' };
export const errorTextStyle: CSSProperties = { fontSize: 12, color: '#dc2626', marginTop: 10 };
export const twoColumns: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

/** Diagonal stripes marking a planned work session. */
export const SESSION_STRIPES: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.45) 0 6px, transparent 6px 12px)',
};

/** How a work session looks once someone has said how it went. */
export function sessionStatusStyle(status?: string): CSSProperties {
  if (status === 'done') return { opacity: 0.55 };
  if (status === 'partial') return { opacity: 0.7 };
  if (status === 'skipped') return { opacity: 0.4, textDecoration: 'line-through' };
  return {};
}
