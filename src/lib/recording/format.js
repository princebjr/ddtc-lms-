// Recording formats (Phase 8; BUILD_PLAN 15.4; owner decision 5): browsers record in different
// formats, so the recorder asks for the first one the browser offers. MP4 with AAC comes first
// because every phone and computer plays it (Safari, and some Chrome versions); then WebM with Opus
// (Chrome, Android), Ogg with Opus (Firefox), and plain MP4 last (older Safari). The server checks
// the real format and length of whatever arrives (finalize-upload).

/** @typedef {{ mimeType: string, extension: 'm4a' | 'webm' | 'ogg' }} RecordingFormat */

/** @type {RecordingFormat[]} */
export const RECORDING_FORMATS = [
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
  { mimeType: 'audio/mp4', extension: 'm4a' },
];

/** Voice at 64 kbit/s: 10 minutes is about 5 MB, 30 minutes about 15 MB (low-bandwidth friendly). */
export const RECORDING_BITS_PER_SECOND = 64000;

/** The answer recorder's limits (D17) and the lecturer's lesson recorder (ADR-007). */
export const LEARNER_RECORDING = {
  maxSeconds: 600,
  maxBytes: 25 * 1024 * 1024,
};
export const LESSON_RECORDING = {
  maxSeconds: 1800,
  maxBytes: 100 * 1024 * 1024,
};

/**
 * The first format the browser can record, or null (then the browser picks).
 * @param {(type: string) => boolean} isTypeSupported
 * @returns {RecordingFormat | null}
 */
export function pickRecordingFormat(isTypeSupported) {
  for (const f of RECORDING_FORMATS) {
    try {
      if (isTypeSupported(f.mimeType)) return f;
    } catch {
      // Some browsers throw for strings they do not understand.
    }
  }
  return null;
}

/** The file extension for what the recorder produced (its actual type may differ from the one asked). @param {string} mime */
export function extensionForMime(mime) {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'audio/webm' || base === 'video/webm') return 'webm';
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/wav' || base === 'audio/wave') return 'wav';
  return 'm4a';
}

const stamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Accra',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Recording 9 Nov 2026 14.05.webm" (Ghana time; no characters a file system refuses). @param {Date} at @param {string} ext */
export function recordingFileName(at, ext) {
  return `Recording ${stamp.format(at).replace(',', '').replace(':', '.')}.${ext}`;
}

/** Whether this browser can record at all (HTTPS, a microphone API and MediaRecorder). */
export function recorderSupported() {
  return typeof window !== 'undefined' && typeof window.MediaRecorder === 'function' && Boolean(navigator.mediaDevices?.getUserMedia);
}
