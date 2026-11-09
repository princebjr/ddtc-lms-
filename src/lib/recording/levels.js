// Loudness for the recorder (DESIGN.md 13, ADR-006): a level from 0 to 1 for the live waveform, and
// the "We can't hear you" warning after 5 seconds of near silence.

/** Seconds of near silence before the recorder asks the user to check their microphone. */
export const SILENCE_SECONDS = 5;
/** Below this level the input counts as silence (room noise on a working microphone is above it). */
export const SILENCE_LEVEL = 0.02;

/**
 * The level of one moment of sound: the RMS of an analyser's time-domain bytes (128 is silence),
 * lifted so that ordinary speech fills most of a bar.
 * @param {Uint8Array} bytes
 */
export function rmsLevel(bytes) {
  if (!bytes.length) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const v = (bytes[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / bytes.length) * 3);
}

/**
 * Tracks whether the input has been near silent for SILENCE_SECONDS. `feed` returns whether to show
 * the warning; any louder moment clears it at once.
 */
export function silenceTracker(seconds = SILENCE_SECONDS, threshold = SILENCE_LEVEL) {
  let quietSince = /** @type {number | null} */ (null);
  return {
    /** @param {number} level @param {number} nowMs */
    feed(level, nowMs) {
      if (level >= threshold) {
        quietSince = null;
        return false;
      }
      if (quietSince === null) quietSince = nowMs;
      return nowMs - quietSince >= seconds * 1000;
    },
    reset() {
      quietSince = null;
    },
  };
}

/** The last `count` levels for the live waveform, newest last. @param {number[]} levels @param {number} level @param {number} count */
export function pushLevel(levels, level, count) {
  const next = levels.length >= count ? levels.slice(levels.length - count + 1) : levels.slice();
  next.push(level);
  return next;
}
