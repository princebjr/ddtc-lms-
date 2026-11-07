import { Download, Pause, Play, RotateCcw, RotateCw, TriangleAlert, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu.jsx';
import { useKeepAwake } from '@/hooks/use-keep-awake.js';
import { useWaveformPeaks } from '@/hooks/use-waveform-peaks.js';
import { clock, fileSize } from '@/lib/audio/format.js';
import { cn } from '@/lib/utils.js';
import { Waveform } from './Waveform.jsx';

// The audio player (ADR-006, RESPONSIVE.md 15.4): the waveform seek bar, 56 px play and pause, back
// and forward 15 s, current time on the left and time remaining on the right, a speed chip (0.75x to
// 2x) and Download with the file size. Sizes: compact (one row, for lists), standard (lesson page)
// and full (grading). States: loading, ready, playing, paused, buffering, error with Retry, offline.
// Never autoplays; preload is metadata only; lock-screen controls through Media Session.

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * How close to the very end a seek may go. Told to seek exactly to the end, Firefox fails to decode
 * a WAV file and WebKit on Linux asks for bytes past the end of the file, and both then report the
 * audio as broken. Playing up to the end works everywhere, so seeks (End, the far right of the
 * waveform, Forward 15 near the end) stop this far short of it and the player shows the end.
 */
export const END_GUARD_SECONDS = 0.1;
/** Positions this close to the end show as the end (a little more than the guard, for rounding). */
const END_SHOWN_WITHIN = END_GUARD_SECONDS * 1.5;

/** @param {number} seconds @param {number} end */
const nearEnd = (seconds, end) => end > END_SHOWN_WITHIN && seconds >= end - END_SHOWN_WITHIN;

/** Announced when a player starts, so every other player on the page pauses (one audio at a time). */
const PLAY_EVENT = 'ddtc:audio-play';

/**
 * @typedef {object} AudioPlayerProps
 * @property {string} title                 shown on the lock screen and announced
 * @property {string} [subtitle]            for example the course name
 * @property {() => Promise<string | null>} getUrl  a fresh signed playback URL (the user's own session, D19)
 * @property {number | null} [durationSeconds]  from the file record, until the browser knows better
 * @property {readonly number[] | null} [peaks]  stored peaks (ADR-006)
 * @property {number | null} [fileSize]
 * @property {(() => void) | null} [onDownload]   omit to hide Download
 * @property {'compact' | 'standard' | 'full'} [size]
 * @property {string} [className]
 */

/** @param {AudioPlayerProps} props */
export function AudioPlayer({ title, subtitle, getUrl, durationSeconds = null, peaks = null, fileSize: bytes = null, onDownload = null, size = 'standard', className }) {
  const audio = useRef(/** @type {HTMLAudioElement | null} */ (null));
  const [src, setSrc] = useState(/** @type {string | null} */ (null));
  const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'error' | 'offline'} */ ('loading'));
  // Listening counts as activity: nobody is signed out for idleness while audio plays (D43).
  useKeepAwake(status === 'playing' || status === 'buffering');
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [speed, setSpeed] = useState(1);
  const [announcement, setAnnouncement] = useState('');
  const wave = useWaveformPeaks({ peaks, src, durationSeconds: duration || durationSeconds });

  // A fresh signed URL; state changes only once the answer arrives.
  const fetchUrl = useCallback(
    () =>
      getUrl()
        .then((url) => {
          if (!url) throw new Error('no url');
          setSrc(url);
          setStatus((s) => (s === 'loading' ? 'ready' : s));
        })
        .catch(() => setStatus(navigator.onLine === false ? 'offline' : 'error')),
    [getUrl],
  );

  useEffect(() => {
    fetchUrl();
  }, [fetchUrl]);

  const retry = () => {
    setStatus('loading');
    setAnnouncement('');
    fetchUrl().then(() => audio.current?.load());
  };

  // Browser events drive the state; the waveform follows timeupdate.
  useEffect(() => {
    const el = audio.current;
    if (!el) return undefined;
    const takeDuration = () => Number.isFinite(el.duration) && el.duration > 0 && setDuration(el.duration);
    /** @type {Array<[string, () => void]>} */
    const handlers = [
      ['loadedmetadata', takeDuration],
      ['durationchange', takeDuration],
      ['timeupdate', () => setCurrent(el.currentTime)],
      ['playing', () => setStatus('playing')],
      ['pause', () => setStatus('paused')],
      ['waiting', () => setStatus('buffering')],
      ['ended', () => setStatus('paused')],
      [
        'error',
        () => {
          setStatus(navigator.onLine === false ? 'offline' : 'error');
          setAnnouncement('The audio could not be played.');
        },
      ],
    ];
    for (const [name, fn] of handlers) el.addEventListener(name, fn);
    // One audio at a time (a lesson can have up to 10, ADR-007): starting this player pauses the
    // others. pause() on a paused element does nothing.
    const announce = () => document.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: el }));
    const onOtherPlay = (/** @type {Event} */ e) => {
      if (/** @type {CustomEvent} */ (e).detail !== el) el.pause();
    };
    el.addEventListener('play', announce);
    document.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => {
      for (const [name, fn] of handlers) el.removeEventListener(name, fn);
      el.removeEventListener('play', announce);
      document.removeEventListener(PLAY_EVENT, onOtherPlay);
    };
  }, [src]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed, src]);

  /** The end as the browser knows it (it can differ a little from the stored duration). */
  const mediaEnd = () => {
    const el = audio.current;
    return el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
  };

  const toggle = async () => {
    const el = audio.current;
    if (!el || !src) return;
    // Follow the player's own state (what the person sees), not only the element's flag.
    if (status === 'playing' || status === 'buffering') {
      el.pause();
      return;
    }
    // At the end, Play starts again from the beginning, as the browsers' own controls do.
    if (el.ended || nearEnd(el.currentTime, mediaEnd())) el.currentTime = 0;
    try {
      await el.play();
    } catch {
      // Blocked or failed: the error event (if any) explains it; otherwise stay paused.
    }
  };

  /** @param {number} seconds */
  const seekTo = (seconds) => {
    const el = audio.current;
    if (!el) return;
    const end = mediaEnd();
    const latest = end > END_GUARD_SECONDS ? end - END_GUARD_SECONDS : end;
    el.currentTime = Math.max(0, end ? Math.min(latest, seconds) : seconds);
    setCurrent(el.currentTime);
  };
  /** @param {number} delta */
  const skip = (delta) => seekTo((audio.current?.currentTime ?? current) + delta);

  // Lock-screen and headset controls while this player is playing (Media Session).
  useEffect(() => {
    if (status !== 'playing' || !('mediaSession' in navigator)) return undefined;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title, artist: subtitle ?? '', album: 'DDTC LMS' });
    /** @type {Array<[MediaSessionAction, MediaSessionActionHandler]>} */
    const actions = [
      ['play', () => audio.current?.play()],
      ['pause', () => audio.current?.pause()],
      ['seekbackward', () => skip(-15)],
      ['seekforward', () => skip(15)],
      ['seekto', (d) => d.seekTime !== undefined && seekTo(d.seekTime)],
    ];
    for (const [action, handler] of actions) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every browser supports every action.
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
    // skip and seekTo read the element directly; only the metadata matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, title, subtitle]);

  const playing = status === 'playing' || status === 'buffering';
  const broken = status === 'error' || status === 'offline';
  const compact = size === 'compact';
  // What the person sees: just short of the end (END_GUARD_SECONDS) shows as the end.
  const shown = nearEnd(current, duration) ? duration : current;
  const remaining = Math.max(0, (duration || 0) - shown);

  const speedChip = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="min-w-14 px-3" aria-label={`Playback speed ${speed}x`} disabled={broken}>
          {speed}x
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
          {SPEEDS.map((s) => (
            <DropdownMenuRadioItem key={s} value={String(s)}>
              {s}x
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const downloadButton = onDownload ? (
    <Button
      variant="outline"
      className={compact ? undefined : 'min-w-0 flex-1 @md:flex-none'}
      onClick={onDownload}
      // One accessible name whatever the width: in a very narrow player only the icon and size show.
      aria-label={compact ? `Download audio${bytes ? `, ${fileSize(bytes)}` : ''}` : `Download${bytes ? ` (${fileSize(bytes)})` : ''}`}
    >
      <Download aria-hidden="true" />
      {compact ? null : (
        <span aria-hidden="true">
          <span className="hidden @2xs:inline">Download </span>
          {bytes ? `(${fileSize(bytes)})` : <span className="@2xs:hidden">Download</span>}
        </span>
      )}
    </Button>
  ) : null;

  const playButton = (
    <button
      type="button"
      onClick={toggle}
      disabled={!src || broken}
      aria-label={playing ? `Pause ${title}` : `Play ${title}`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-transform duration-fast ease-standard active:scale-98 focus-visible:focus-ring disabled:opacity-50',
        compact ? 'size-11' : 'size-14',
      )}
    >
      {playing ? <Pause className={compact ? 'size-5' : 'size-6'} aria-hidden="true" /> : <Play className={cn(compact ? 'size-5' : 'size-6', 'translate-x-px')} aria-hidden="true" />}
    </button>
  );

  return (
    <section
      aria-label={`Audio: ${title}`}
      data-slot="audio-player"
      data-status={status}
      data-size={size}
      className={cn('@container flex w-full flex-col gap-3 rounded-lg border border-hairline bg-card', compact ? 'p-2' : 'p-4 sm:p-5', className)}
    >
      {/* No autoplay; only metadata is fetched until the person presses play (RESPONSIVE.md 15.4). */}
      <audio ref={audio} src={src ?? undefined} preload="metadata" className="hidden" />
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>

      {compact ? (
        <div className="flex items-center gap-3">
          {playButton}
          <div className="min-w-0 flex-1">
            <Waveform peaks={wave.peaks} state={status === 'loading' ? 'loading' : wave.state} currentSeconds={shown} durationSeconds={duration} onSeek={seekTo} size="compact" label={`${title} position`} disabled={broken} />
          </div>
          <span className="shrink-0 text-caption tabular-nums text-ink-secondary">
            {clock(shown)} / {clock(duration)}
          </span>
          {downloadButton}
        </div>
      ) : (
        <>
          <Waveform
            peaks={wave.peaks}
            state={status === 'loading' ? 'loading' : wave.state}
            currentSeconds={shown}
            durationSeconds={duration}
            onSeek={seekTo}
            size={size === 'full' ? 'full' : 'standard'}
            label={`${title} position`}
            disabled={broken}
          />
          <div className="flex items-center justify-between text-caption tabular-nums text-ink-secondary">
            <span>{clock(shown)}</span>
            <span aria-label={`${clock(remaining)} remaining`}>-{clock(remaining)}</span>
          </div>
          {/* The player follows its own width (a container), not the screen's: in a narrow card the
              play controls sit centred above speed and Download; from 28rem they share one row. */}
          <div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
            <div className="flex items-center justify-center gap-2 @md:justify-start">
              <Button variant="ghost" className="px-3" onClick={() => skip(-15)} disabled={!src || broken} aria-label="Back 15 seconds">
                <RotateCcw aria-hidden="true" />
                <span className="text-caption">15</span>
              </Button>
              {playButton}
              <Button variant="ghost" className="px-3" onClick={() => skip(15)} disabled={!src || broken} aria-label="Forward 15 seconds">
                <span className="text-caption">15</span>
                <RotateCw aria-hidden="true" />
              </Button>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              {speedChip}
              {downloadButton}
            </div>
          </div>
        </>
      )}

      {status === 'buffering' ? <p className="m-0 text-caption text-ink-secondary">Loading the next part…</p> : null}
      {broken ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-fill p-3 text-body-sm text-ink">
          {status === 'offline' ? <WifiOff className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" /> : <TriangleAlert className="size-5 shrink-0 text-error" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            {status === 'offline' ? 'You are offline. Connect to the internet to play this audio.' : 'The audio could not be loaded.'}
          </span>
          <Button variant="outline" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : null}
    </section>
  );
}
