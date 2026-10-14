import type { CSSProperties, ReactNode } from 'react';
import { modal, overlay } from './styles';

/** Dimmed backdrop that closes on click, around a white card that doesn't. */
export default function ModalShell({ onClose, style, children }: {
  onClose: () => void; style?: CSSProperties; children: ReactNode;
}) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, ...style }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
