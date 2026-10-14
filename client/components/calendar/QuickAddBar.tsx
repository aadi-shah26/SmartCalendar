'use client';
import { useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { parseText } from '../../lib/nlp/client';
import type { ParsedItem } from '../../lib/nlp/parse';

/** One line of plain English → a parsed event or task, handed to `onParsed` to review. */
export default function QuickAddBar({ onParsed }: { onParsed: (item: ParsedItem) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasText = Boolean(text.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = text.trim();
    if (!input || busy) return;
    setBusy(true); setError(null);
    try {
      onParsed(await parseText(input));
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${error ? '#e53e3e' : '#e0e0e0'}`, borderRadius: 8, padding: '6px 6px 6px 12px' }}>
      <Sparkles style={{ width: 14, height: 14, color: '#999', flexShrink: 0 }} />
      <input
        value={text}
        onChange={e => { setText(e.target.value); setError(null); }}
        placeholder='Quick add: "essay due fri, 3h"'
        disabled={busy}
        maxLength={500}
        style={{ border: 'none', outline: 'none', fontSize: 13, width: 220, background: 'transparent' }}
      />
      <button type="submit" disabled={busy || !hasText} style={{
        border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600,
        background: hasText ? '#1a1a1a' : '#eee', color: hasText ? '#fff' : '#999',
        cursor: busy || !hasText ? 'default' : 'pointer', whiteSpace: 'nowrap',
      }}>
        {busy ? 'Reading…' : 'Add'}
      </button>
      {error && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40, background: '#fff', border: '1px solid #f3c2c2', color: '#c53030', borderRadius: 8, padding: '6px 10px', fontSize: 12, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }}>
          {error}
        </div>
      )}
    </form>
  );
}
