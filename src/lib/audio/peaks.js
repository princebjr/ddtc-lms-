// Waveform peaks (ADR-006): 128 values from 0 to 1 describing loudness across a recording.
// computePeaks decodes audio in the browser (the uploader's, or a viewer's for files under 10
// minutes); resamplePeaks fits them to the number of bars the screen has room for.

export const PEAK_COUNT = 128;
/** Viewers compute missing peaks only for recordings shorter than this (ADR-006). */
export const VIEWER_PEAKS_MAX_SECONDS = 600;

/**
 * Loudness of `count` equal slices of the recording, scaled so the loudest is 1. Decodes at a
 * low sample rate in one channel to keep memory small. Returns null when the browser cannot
 * decode the file or the device is short of memory for a long recording.
 * @param {Blob | ArrayBuffer} source
 * @param {number} [count]
 * @returns {Promise<number[] | null>}
 */
export async function computePeaks(source, count = PEAK_COUNT) {
  try {
    const size = source instanceof Blob ? source.size : source.byteLength;
    const memory = /** @type {{ deviceMemory?: number }} */ (navigator).deviceMemory ?? 8;
    if (size > 60 * 1024 * 1024 && memory < 4) return null;
    const bytes = source instanceof Blob ? await source.arrayBuffer() : source.slice(0);
    const Context = window.OfflineAudioContext ?? /** @type {any} */ (window).webkitOfflineAudioContext;
    if (!Context) return null;
    const context = new Context(1, 1, 8000);
    /** @type {AudioBuffer} */
    const audio = await new Promise((resolve, reject) => {
      // The callback form also works in older Safari.
      const result = context.decodeAudioData(bytes, resolve, reject);
      if (result && typeof result.then === 'function') result.then(resolve, reject);
    });
    const data = audio.getChannelData(0);
    if (!data.length) return null;
    const slice = Math.max(1, Math.floor(data.length / count));
    const peaks = [];
    let loudest = 0;
    for (let i = 0; i < count; i += 1) {
      let peak = 0;
      const end = Math.min(data.length, (i + 1) * slice);
      for (let j = i * slice; j < end; j += 1) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
      if (peak > loudest) loudest = peak;
    }
    return peaks.map((p) => (loudest ? Math.round((p / loudest) * 1000) / 1000 : 0));
  } catch {
    return null;
  }
}

/**
 * Fits peaks to `bars` bars, keeping each bar's loudest moment.
 * @param {readonly number[]} peaks @param {number} bars
 * @returns {number[]}
 */
export function resamplePeaks(peaks, bars) {
  if (!peaks.length || bars <= 0) return [];
  return Array.from({ length: bars }, (_, i) => {
    const start = Math.floor((i * peaks.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j += 1) max = Math.max(max, peaks[j]);
    return max;
  });
}

/** Number of 3 px bars with 2 px gaps that fit a width (phone about 48, desktop about 120). @param {number} width */
export function barsForWidth(width) {
  return Math.max(16, Math.min(160, Math.floor((width + 2) / 5)));
}
