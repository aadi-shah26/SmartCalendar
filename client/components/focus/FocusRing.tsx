'use client';
import type { ReactNode } from 'react';

const SIZE = 320;
const STROKE = 14;
const R = (SIZE - STROKE) / 2 - 10;
const C = 2 * Math.PI * R;

/**
 * The timer's ring: a track, an arc that fills as the phase goes on (with a dot at its tip), and
 * a soft pulse behind it while running. `children` sits in the middle.
 */
export default function FocusRing({ progress, color, running, children }: {
  progress: number; color: string; running: boolean; children: ReactNode;
}) {
  const p = Math.min(1, Math.max(0, progress));
  const angle = p * 2 * Math.PI - Math.PI / 2;
  const tip = { x: SIZE / 2 + R * Math.cos(angle), y: SIZE / 2 + R * Math.sin(angle) };
  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, maxWidth: '82vw', maxHeight: '82vw', aspectRatio: '1' }}>
      <style>{`
        @keyframes focus-pulse { 0%, 100% { transform: scale(0.92); opacity: 0.35; } 50% { transform: scale(1.02); opacity: 0.6; } }
      `}</style>
      <div aria-hidden style={{
        position: 'absolute', inset: 18, borderRadius: '50%', background: color, filter: 'blur(28px)',
        opacity: running ? undefined : 0.18, transition: 'background 0.8s ease, opacity 0.6s ease',
        animation: running ? 'focus-pulse 4s ease-in-out infinite' : undefined,
      }} />
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" style={{ position: 'relative', display: 'block' }}>
        <defs>
          <linearGradient id="focus-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.75} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R + STROKE / 2 + 6} fill="#fff" />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={color} strokeOpacity={0.14} strokeWidth={STROKE}
          style={{ transition: 'stroke 0.8s ease' }} />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="url(#focus-arc)" strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 0.35s linear' }} />
        {p > 0.002 && (
          <circle cx={tip.x} cy={tip.y} r={STROKE / 2 + 3} fill="#fff" stroke={color} strokeWidth={4}
            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'cx 0.35s linear, cy 0.35s linear' }} />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}
