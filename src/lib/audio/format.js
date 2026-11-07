// Time and size text for the audio player (ADR-006): a clock for the eye ("12:40", "1:02:05"),
// words for screen readers ("1 minute 20 seconds"), and a file size for the Download button.

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/** "0:05", "12:40", "1:02:05". @param {number} seconds */
export function clock(seconds) {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** "1 hour 2 minutes 5 seconds", "0 seconds". @param {number} seconds */
export function spoken(seconds) {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const parts = [
    [Math.floor(s / 3600), 'hour'],
    [Math.floor((s % 3600) / 60), 'minute'],
    [s % 60, 'second'],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, unit]) => `${n} ${unit}${n === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : '0 seconds';
}

/** "850 KB", "12.4 MB". @param {number | null | undefined} bytes */
export function fileSize(bytes) {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
