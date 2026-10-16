import { describe, it, expect } from 'vitest';
import { isTypingTarget, shortcutFor } from '../shortcuts';

const key = (k: string, patch: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: EventTarget | null } = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: null, ...patch });
const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
const div = { tagName: 'DIV', isContentEditable: false } as unknown as EventTarget;
const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;

describe('shortcutFor', () => {
  it('maps keys, either case', () => {
    expect(shortcutFor(key('n'), false)).toBe('newTask');
    expect(shortcutFor(key('E'), false)).toBe('newEvent');
    expect(shortcutFor(key('ArrowLeft'), false)).toBe('prev');
    expect(shortcutFor(key('k'), false)).toBe('next');
    expect(shortcutFor(key('m'), false)).toBe('viewMonth');
    expect(shortcutFor(key('/'), false)).toBe('quickAdd');
    expect(shortcutFor(key('?'), false)).toBe('help');
    expect(shortcutFor(key('x'), false)).toBeNull();
  });
  it('leaves browser shortcuts alone', () => {
    expect(shortcutFor(key('t', { metaKey: true }), false)).toBeNull();
    expect(shortcutFor(key('n', { ctrlKey: true }), false)).toBeNull();
    expect(shortcutFor(key('ArrowLeft', { altKey: true }), false)).toBeNull();
  });
  it('ignores keys while typing', () => {
    expect(shortcutFor(key('n', { target: input }), false)).toBeNull();
    expect(shortcutFor(key('n', { target: editable }), false)).toBeNull();
    expect(shortcutFor(key('n', { target: div }), false)).toBe('newTask');
  });
  it('only closes while a window is open', () => {
    expect(shortcutFor(key('n'), true)).toBeNull();
    expect(shortcutFor(key('Escape'), true)).toBe('close');
    expect(shortcutFor(key('Escape', { target: input }), true)).toBe('close');
    expect(shortcutFor(key('Escape'), false)).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('spots text fields', () => {
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
