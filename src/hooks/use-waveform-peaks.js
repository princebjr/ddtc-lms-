import { useEffect, useState } from 'react';
import { computePeaks, VIEWER_PEAKS_MAX_SECONDS } from '@/lib/audio/peaks.js';

// Peaks for a waveform (ADR-006). Stored peaks are used as they are. When a file has none, a viewer
// computes them for recordings under 10 minutes (skeleton bars meanwhile); longer recordings show
// even placeholder bars rather than downloading a large file.

/**
 * @param {{ peaks?: readonly number[] | null, src?: string | null, durationSeconds?: number | null }} input
 * @returns {{ peaks: readonly number[] | null, state: 'ready' | 'loading' | 'placeholder' }}
 */
export function useWaveformPeaks({ peaks, src, durationSeconds }) {
  const stored = peaks && peaks.length ? peaks : null;
  const canCompute = !stored && Boolean(src) && Boolean(durationSeconds) && Number(durationSeconds) < VIEWER_PEAKS_MAX_SECONDS;
  const [computed, setComputed] = useState(/** @type {{ src: string, peaks: number[] | null } | null} */ (null));

  useEffect(() => {
    if (!canCompute || !src) return undefined;
    let cancelled = false;
    fetch(src)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('fetch'))))
      .then((bytes) => computePeaks(bytes))
      .then((result) => {
        if (!cancelled) setComputed({ src, peaks: result });
      })
      .catch(() => {
        if (!cancelled) setComputed({ src, peaks: null });
      });
    return () => {
      cancelled = true;
    };
  }, [canCompute, src]);

  if (stored) return { peaks: stored, state: 'ready' };
  if (!canCompute) return { peaks: null, state: 'placeholder' };
  if (!computed || computed.src !== src) return { peaks: null, state: 'loading' };
  return computed.peaks ? { peaks: computed.peaks, state: 'ready' } : { peaks: null, state: 'placeholder' };
}
