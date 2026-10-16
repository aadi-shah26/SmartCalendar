'use client';
import { useState } from 'react';
import { ChevronDown, CircleUserRound } from 'lucide-react';

interface MenuItem {
  label: string;
  /** Omitted while the item can't be used (Google is busy); it shows greyed out. */
  onSelect?: () => void;
}

export default function ProfileMenu({ googleConnected, googleBusy, onProfile, onConnectGoogle, onSyncGoogle, onDisconnectGoogle, onSignOut }: {
  googleConnected: boolean; googleBusy: boolean;
  onProfile: () => void; onConnectGoogle: () => void; onSyncGoogle: () => void;
  onDisconnectGoogle: () => void; onSignOut: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // Choosing an item closes the menu, except signing out, which leaves the page.
  const closing = (action: () => void) => () => { setIsOpen(false); action(); };
  const google = (action: () => void) => (googleBusy ? undefined : closing(action));

  const items: MenuItem[] = [
    { label: 'Profile', onSelect: closing(onProfile) },
    googleConnected
      ? { label: 'Sync Google Calendar', onSelect: google(onSyncGoogle) }
      : { label: 'Connect Google Calendar', onSelect: google(onConnectGoogle) },
    ...(googleConnected ? [{ label: 'Disconnect Google Calendar', onSelect: google(onDisconnectGoogle) }] : []),
    { label: 'Sign out', onSelect: onSignOut },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer' }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open profile menu"
      >
        <CircleUserRound style={{ width: 18, height: 18, color: '#666' }} />
        <ChevronDown style={{ width: 14, height: 14, color: '#777' }} />
      </button>

      {isOpen && (
        <div
          role="menu"
          style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 190, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, boxShadow: '0 10px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}
        >
          {items.map(({ label, onSelect }) => (
            <button
              key={label}
              role="menuitem"
              type="button"
              onClick={onSelect}
              style={{
                width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 8,
                padding: '8px 10px', fontSize: 13,
                color: onSelect ? '#1a1a1a' : '#bbb',
                cursor: onSelect ? 'pointer' : 'default',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
