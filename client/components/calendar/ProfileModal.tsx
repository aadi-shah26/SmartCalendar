'use client';
import { useState } from 'react';
import { getTextColor } from '../../lib/calendar/colors';
import type { Profile } from '../../lib/calendar/types';
import ColorPicker from './ColorPicker';
import ModalShell from './ModalShell';
import { cancelBtnStyle, inputStyle, labelStyle, saveBtnStyle, twoColumns } from './styles';

export default function ProfileModal({ profile, accentColor, onSave, onClose }: {
  profile: Profile | null; accentColor: string;
  /** Resolves true when saved. */
  onSave: (draft: Profile) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Profile>(profile ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<Profile>) => setDraft(d => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <ModalShell onClose={onClose} style={{ maxWidth: 440 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', backgroundColor: accentColor, color: getTextColor(accentColor),
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0,
        }}>
          {(draft.name || profile?.email || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>{draft.name || 'Your Profile'}</h2>
          <div style={{ fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.email}</div>
        </div>
      </div>

      <label style={labelStyle}>Name</label>
      <input value={draft.name ?? ''} onChange={e => set({ name: e.target.value })} style={inputStyle} placeholder="Full name" />

      <label style={labelStyle}>Phone</label>
      <input value={draft.phone ?? ''} onChange={e => set({ phone: e.target.value })} style={inputStyle} placeholder="(123) 456-7890" />

      <div style={twoColumns}>
        <div>
          <label style={labelStyle}>Works best</label>
          <select value={draft.work_time ?? ''} onChange={e => set({ work_time: e.target.value })} style={inputStyle}>
            <option value="">—</option>
            <option value="day">Daytime</option>
            <option value="night">Night Owl</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Work style</label>
          <select value={draft.work_style ?? ''} onChange={e => set({ work_style: e.target.value })} style={inputStyle}>
            <option value="">—</option>
            <option value="social">Social</option>
            <option value="solo">Solo</option>
          </select>
        </div>
      </div>

      <label style={labelStyle}>Theme color</label>
      <ColorPicker value={draft.theme_color ?? accentColor} onChange={c => set({ theme_color: c })} />

      <label style={labelStyle}>Google Calendar email</label>
      <input value={draft.gcal_email ?? ''} onChange={e => set({ gcal_email: e.target.value })} style={inputStyle} placeholder="you@gmail.com" />

      {saved && <div style={{ fontSize: 12, color: '#16a34a', marginTop: 10, fontWeight: 600 }}>Saved!</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={cancelBtnStyle}>Close</button>
        <button onClick={save} disabled={saving} style={{ ...saveBtnStyle, backgroundColor: accentColor, color: getTextColor(accentColor), opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalShell>
  );
}
