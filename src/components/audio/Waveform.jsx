import { useEffect, useRef, useState } from 'react';
import { clock, spoken } from '@/lib/audio/format.js';
import { barsForWidth, resamplePeaks } from '@/lib/audio/peaks.js';
import { cn } from '@/lib/utils.js';

// The waveform seek bar (ADR-006, DESIGN.md 13): thin rounded bars whose height follows loudness,
// centred on a middle line; played bars in `wave-played`, the rest in `wave-unplayed`; a playhead
// line with round handles. Tap anywhere to seek, drag to scrub (a time bubble shows where you will
// land), or use the keyboard: arrows seek 5 s, Page Up and Page Down 15 s, Home and End.
// It is a slider for assistive technology, with the time spoken as words.

const HEIGHTS = { compact: 'h-8', standard: 'h-14', full: 'h-24' };
/** Even bars when a recording has no peaks (ADR-006: long files without stored peaks). */
const PLACEHOLDER = 0.35;
/** Static skeleton heights while peaks load: a calm, uneven shape. */
const SKELETON = Array.from({ length: 32 }, (_, i) => 0.3 + 0.35 * Math.abs(Math.sin(i * 1.7)));
const KEY_STEPS = /** @type {Record<string, number>} */ ({ ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -15, PageUp: 15 });

/**
 * @param {{
 *   peaks: readonly number[] | null,
 *   state: 'ready' | 'loading' | 'placeholder',
 *   currentSeconds: number,
 *   durationSeconds: number,
 *   onSeek: (seconds: number) => void,
 *   size?: keyof typeof HEIGHTS,
 *   label?: string,
 *   disabled?: boolean,
 * }} props
 */
export function Waveform({ peaks, state, currentSeconds, durationSeconds, onSeek, size = 'standard', label = 'Audio position', disabled = false }) {
  const box = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [bars, setBars] = useState(48);
  const [drag, setDrag] = useState(/** @type {number | null} */ (null)); // 0..1 while dragging

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setBars(barsForWidth(el.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const duration = durationSeconds > 0 ? durationSeconds : 0;
  const shown = drag ?? (duration ? Math.min(1, Math.max(0, currentSeconds / duration)) : 0);
  const heights =
    state === 'loading'
      ? Array.from({ length: bars }, (_, i) => SKELETON[i % SKELETON.length])
      : state === 'placeholder' || !peaks
        ? Array.from({ length: bars }, () => PLACEHOLDER)
        : resamplePeaks(peaks, bars).map((p) => Math.max(0.08, p));
  const played = Math.round(shown * bars);
  const inactive = disabled || !duration;

  /** @param {number} clientX */
  const ratioAt = (clientX) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  /** @param {import('react').PointerEvent<HTMLDivElement>} e */
  const onPointerDown = (e) => {
    if (inactive) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(ratioAt(e.clientX));
  };
  /** @param {import('react').PointerEvent<HTMLDivElement>} e */
  const onPointerMove = (e) => {
    if (drag !== null) setDrag(ratioAt(e.clientX));
  };
  /** @param {import('react').PointerEvent<HTMLDivElement>} e */
  const onPointerUp = (e) => {
    if (drag === null) return;
    const ratio = ratioAt(e.clientX);
    setDrag(null);
    onSeek(ratio * duration);
  };

  /** @param {import('react').KeyboardEvent<HTMLDivElement>} e */
  const onKeyDown = (e) => {
    if (inactive) return;
    let target = null;
    if (e.key in KEY_STEPS) target = currentSeconds + KEY_STEPS[e.key];
    if (e.key === 'Home') target = 0;
    if (e.key === 'End') target = duration;
    if (target === null) return;
    e.preventDefault();
    onSeek(Math.min(duration, Math.max(0, target)));
  };

  const at = drag !== null ? drag * duration : currentSeconds;
  return (
    <div
      ref={box}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(at)}
      aria-valuetext={`${spoken(at)} of ${spoken(duration)}`}
      aria-disabled={inactive || undefined}
      aria-busy={state === 'loading' || undefined}
      data-slot="waveform"
      data-state={state}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKeyDown}
      className={cn('relative w-full touch-none select-none rounded-sm focus-visible:focus-ring', HEIGHTS[size], inactive ? 'cursor-default' : 'cursor-pointer')}
    >
      <div className="wave-bars h-full w-full overflow-hidden" aria-hidden="true">
        {heights.map((h, i) => (
          <span
            key={i}
            data-played={state !== 'loading' && i < played ? 'true' : undefined}
            className={cn('wave-bar', state === 'loading' ? 'skeleton-shimmer' : i < played ? 'bg-wave-played' : 'bg-wave-unplayed')}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        ))}
      </div>
      {state !== 'loading' && duration ? <span className="wave-playhead" style={{ left: `${shown * 100}%` }} aria-hidden="true" /> : null}
      {drag !== null ? (
        <span
          data-slot="time-bubble"
          className="pointer-events-none absolute -top-9 -translate-x-1/2 rounded-full bg-ink px-2 py-1 text-caption text-page shadow-overlay"
          style={{ left: `${drag * 100}%` }}
          aria-hidden="true"
        >
          {clock(drag * duration)}
        </span>
      ) : null}
    </div>
  );
}
