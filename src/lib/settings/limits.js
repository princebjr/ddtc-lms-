// Upload limits in words and numbers (owner request of 2026-11-11, ADR-020 item 7). Pure helpers with no
// imports, so the first route's validation can use them; the values come from client-settings.js.

/** @typedef {'lesson_audio' | 'instruction_audio' | 'submission_audio' | 'submission_document' | 'lesson_attachment' | 'profile_image' | 'course_cover'} FileKind */
/** @typedef {{ file_limits: Partial<Record<FileKind, { max_bytes?: number, max_seconds?: number }>>, pass_mark: number, require_course_approval: boolean }} ClientSettings */

const MB = 1024 * 1024;

/**
 * One kind's limits: largest file in bytes and longest recording in seconds, or null where unknown
 * (settings not read yet, or the kind has no length limit). Unknown means "let the server decide".
 * @param {ClientSettings | null} settings
 * @param {FileKind} kind
 * @returns {{ maxBytes: number | null, maxSeconds: number | null }}
 */
export function limitFor(settings, kind) {
  const l = settings?.file_limits?.[kind];
  const bytes = Number(l?.max_bytes);
  const seconds = Number(l?.max_seconds);
  return { maxBytes: bytes > 0 ? bytes : null, maxSeconds: seconds > 0 ? seconds : null };
}

/**
 * A size limit in words: "2 MB", "2.5 MB", "500 KB".
 * @param {number} bytes
 */
export function sizeText(bytes) {
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.round((bytes / MB) * 10) / 10} MB`;
}

/**
 * A length limit in words: "10 minutes", "1 minute", "90 minutes", "45 seconds".
 * @param {number} seconds
 */
export function lengthText(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/**
 * "up to 2 MB", "up to 25 MB and 10 minutes", or "" while the limits are unknown.
 * @param {{ maxBytes: number | null, maxSeconds: number | null }} limit
 */
export function limitText(limit) {
  if (!limit.maxBytes) return '';
  return `up to ${sizeText(limit.maxBytes)}${limit.maxSeconds ? ` and ${lengthText(limit.maxSeconds)}` : ''}`;
}

/**
 * Why a file is too large for its kind, or null when it fits (or the limit is unknown).
 * @param {{ size: number }} file
 * @param {{ maxBytes: number | null }} limit
 */
export function tooLarge(file, limit) {
  return limit.maxBytes && file.size > limit.maxBytes ? `The file is larger than ${sizeText(limit.maxBytes)}.` : null;
}

/**
 * The in-app recorder's limits for a kind: the setting's length and size, with a recorder's own cap on
 * length where a decision sets one (ADR-007: lesson recordings stop at 30 minutes). `fallback` applies
 * while the settings are unknown.
 * @param {ClientSettings | null} settings
 * @param {FileKind} kind
 * @param {{ maxSeconds: number, maxBytes: number }} fallback
 * @param {number} [capSeconds]
 * @returns {{ maxSeconds: number, maxBytes: number }}
 */
export function recordingLimits(settings, kind, fallback, capSeconds = Infinity) {
  const l = limitFor(settings, kind);
  return {
    maxSeconds: Math.min(l.maxSeconds ?? fallback.maxSeconds, capSeconds),
    maxBytes: l.maxBytes ?? fallback.maxBytes,
  };
}
