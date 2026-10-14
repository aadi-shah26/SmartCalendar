export const THEME_COLOR = '#1a1a1a';

export const PASTEL_COLORS = [
  '#1a1a1a', '#f4a8b8', '#f9c882', '#a8d8a8',
  '#84c4e8', '#b8a8e0', '#f8e4a4', '#88ccc4',
  '#e8a8c4', '#a8c8e8', '#c8e8a4', '#e4c8a8',
];

/** Black or white, whichever reads better on the given background. */
export function getTextColor(hex: string): string {
  if (!hex || hex === THEME_COLOR) return '#fff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.58 ? '#1a1a1a' : '#fff';
}
