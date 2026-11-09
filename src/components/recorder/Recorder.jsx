import { Check, Mic, MicOff, Pause, Play, RotateCcw, Square, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useRecorder } from '@/hooks/use-recorder.js';
import { clock, fileSize, spoken } from '@/lib/audio/format.js';
import { computePeaks } from '@/lib/audio/peaks.js';
import { recordingFileName } from '@/lib/recording/format.js';
import { cn } from '@/lib/utils.js';

// The recorder (DESIGN.md 13, ADR-006; Phase 8): a large microphone button with the limits; while
// recording a right-to-left live waveform in wave-recording, a pulsing red dot, a large timer, a thin
// time-left bar, Pause and Resume, a 72 px red Stop and Discard; "We can't hear you. Check your
// microphone." after 5 s of silence. Review: the waveform with Play preview, Re-record and Use
// recording. A clear blocked or unsupported state offers an upload instead. Used for learners'
// answers (10 minutes, 25 MB) and lecturers' lesson audio (30 minutes, ADR-007).

/** @typedef {import('@/hooks/use-recorder.js').Recording} Recording */

const TOASTS = /** @type {const} */ ({
  learner: {
    saved: 'learner.recording-saved',
    discarded: 'learner.recording-discarded',
    blocked: 'learner.microphone-blocked',
  },
  lecturer: {
    saved: 'lecturer.recording-saved',
    discarded: 'lecturer.recording-discarded',
    blocked: 'lecturer.microphone-blocked',
  },
});

/**
 * @param {{
 *   limits: { maxSeconds: number, maxBytes: number },
 *   audience: 'learner' | 'lecturer',
 *   onUse: (file: File, facts: { seconds: number, peaks: number[] | null }) => void,
 *   onUploadInstead?: () => void,
 *   draft?: { userId: string, key: string } | null,
 *   restored?: Recording | null,
 *   disabled?: boolean,
 *   title?: string,
 *   onActiveChange?: (active: boolean) => void,
 * }} props
 */
export function Recorder({ limits, audience, onUse, onUploadInstead, draft = null, restored = null, disabled = false, title = 'Recording', onActiveChange }) {
  const toast = useToast();
  const r = useRecorder({
    maxSeconds: limits.maxSeconds,
    maxBytes: limits.maxBytes,
    draft,
  });
  const ids = TOASTS[audience];
  const minutes = Math.round(limits.maxSeconds / 60);
  const megabytes = Math.round(limits.maxBytes / 1048576);
  const { restore, state } = r;
  const root = useRef(/** @type {HTMLDivElement | null} */ (null));
  const previous = useRef(state);
  const active = state === 'recording' || state === 'paused' || state === 'stopped';

  // While the recorder is in use the parent keeps its sticky bar out of the way (it would cover Stop).
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  // When recording starts, the recorder comes to the middle of the screen.
  useEffect(() => {
    if (state === 'recording' && previous.current === 'starting') {
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      root.current?.scrollIntoView?.({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    }
    previous.current = state;
  }, [state]);

  // A recording kept on this device (D43) comes back for review.
  useEffect(() => {
    if (restored && state === 'idle') restore(restored);
  }, [restored, state, restore]);

  // Blocked microphone: say so once, with the way out.
  useEffect(() => {
    if (state !== 'denied') return;
    toast.show(ids.blocked, onUploadInstead ? { onAction: onUploadInstead } : {});
  }, [state, toast, ids, onUploadInstead]);

  if (state === 'denied' || state === 'unsupported' || state === 'error') {
    const text =
      state === 'denied'
        ? 'The microphone is blocked for this site. Allow it in your browser settings, or upload a recording instead.'
        : state === 'unsupported'
          ? 'This browser or device cannot record here. Use your phone’s own recorder and upload the file instead.'
          : 'The recording could not start. Try again, or upload a recording instead.';
    return (
      <div ref={root} data-slot="recorder" data-state={state} className="flex flex-col items-start gap-3 rounded-md bg-fill p-4" role="status">
        <p className="m-0 flex items-start gap-2 text-body text-ink">
          <MicOff className="mt-0.5 size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
          {text}
        </p>
        <div className="flex flex-wrap gap-2">
          {onUploadInstead ? (
            <Button type="button" variant="outline" onClick={onUploadInstead}>
              <Upload aria-hidden="true" />
              Upload a recording
            </Button>
          ) : null}
          {state !== 'unsupported' ? (
            <Button type="button" variant="ghost" onClick={() => void r.start()}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (state === 'stopped' && r.recording) {
    return (
      <div ref={root}>
        <Review
          recording={r.recording}
          title={title}
          disabled={disabled}
          onRerecord={() => {
            r.discard();
            toast.show(ids.discarded);
          }}
          onUse={(peaks) => {
            const rec = /** @type {Recording} */ (r.recording);
            const file = new File([rec.blob], recordingFileName(new Date(), rec.extension), { type: rec.mimeType.split(';')[0] });
            toast.show(ids.saved);
            onUse(file, { seconds: rec.seconds, peaks });
            r.discard();
          }}
        />
      </div>
    );
  }

  if (state === 'recording' || state === 'paused') {
    const left = Math.max(0, limits.maxSeconds - r.seconds);
    const paused = state === 'paused';
    return (
      <div ref={root} data-slot="recorder" data-state={state} className="flex flex-col gap-4 rounded-md border border-hairline bg-card p-4">
        <LiveWaveform levels={r.levels} paused={paused} />
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-label text-ink">
            <span aria-hidden="true" className={cn('size-3 rounded-full bg-error', !paused && 'motion-safe:animate-pulse')} />
            {paused ? 'Paused' : 'Recording'}
          </span>
          <span className="text-large-title tabular-nums text-ink" aria-live="off">
            {clock(r.seconds)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label="Time used"
            aria-valuemin={0}
            aria-valuemax={limits.maxSeconds}
            aria-valuenow={Math.round(r.seconds)}
            aria-valuetext={`${spoken(r.seconds)} of ${minutes} minutes`}
            className="h-1 overflow-hidden rounded-full bg-fill"
          >
            <div
              className="h-full bg-error"
              style={{
                width: `${Math.min(100, (r.seconds / limits.maxSeconds) * 100)}%`,
              }}
            />
          </div>
          <span className="text-caption text-ink-secondary tabular-nums">{clock(left)} left</span>
        </div>
        {r.silent ? (
          <p role="status" className="m-0 rounded-md bg-fill p-3 text-body-sm text-ink">
            We can’t hear you. Check your microphone.
          </p>
        ) : null}
        {r.notice === 'background' ? (
          <p role="status" className="m-0 rounded-md bg-fill p-3 text-body-sm text-ink">
            Recording paused because you left the app. Tap Resume to carry on.
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          {/* On phones Discard and Pause show their icon only (44 px targets; the words stay for screen readers). */}
          <Button type="button" variant="ghost" onClick={r.discard} aria-label="Discard recording" className="max-sm:w-11 max-sm:px-0">
            <Trash2 aria-hidden="true" />
            <span className="max-sm:sr-only">Discard</span>
          </Button>
          <button
            type="button"
            onClick={r.stop}
            aria-label="Stop recording"
            className="inline-flex size-18 shrink-0 items-center justify-center rounded-full bg-error text-on-error transition-transform duration-fast active:scale-95 focus-visible:focus-ring"
          >
            <Square className="size-7 fill-current" aria-hidden="true" />
          </button>
          {paused ? (
            <Button type="button" variant="secondary" onClick={r.resume} className="max-sm:w-11 max-sm:px-0">
              <Play aria-hidden="true" />
              <span className="max-sm:sr-only">Resume</span>
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={r.pause} className="max-sm:w-11 max-sm:px-0">
              <Pause aria-hidden="true" />
              <span className="max-sm:sr-only">Pause</span>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={root}
      data-slot="recorder"
      data-state={state}
      className="flex flex-col items-center gap-3 rounded-md border border-hairline bg-card p-4 text-center"
    >
      <button
        type="button"
        onClick={() => void r.start()}
        disabled={disabled || state === 'starting'}
        aria-label="Start recording"
        className="inline-flex size-18 items-center justify-center rounded-full bg-error text-on-error transition-transform duration-fast active:scale-95 focus-visible:focus-ring disabled:opacity-50"
      >
        <Mic className="size-8" aria-hidden="true" />
      </button>
      <span className="text-label text-ink">{state === 'starting' ? 'Starting…' : 'Tap to record'}</span>
      <span className="text-body-sm text-ink-secondary">
        Up to {minutes} minutes ({megabytes} MB). Keep this page open while you record: leaving the app or locking the phone pauses the recording.
      </span>
      {r.notice === 'limit' ? <p className="m-0 text-body-sm text-ink">The recording reached its {minutes}-minute limit.</p> : null}
    </div>
  );
}

/**
 * The recording just made: its waveform with Play preview, Re-record and Use recording.
 * @param {{ recording: Recording, title: string, disabled: boolean, onRerecord: () => void, onUse: (peaks: number[] | null) => void }} props
 */
function Review({ recording, title, disabled, onRerecord, onUse }) {
  const url = useMemo(() => URL.createObjectURL(recording.blob), [recording.blob]);
  const [peaks, setPeaks] = useState(/** @type {number[] | null} */ (null));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    let live = true;
    computePeaks(recording.blob).then((p) => {
      if (live) setPeaks(p);
    });
    return () => {
      live = false;
    };
  }, [recording.blob]);
  return (
    <div data-slot="recorder" data-state="stopped" className="flex flex-col gap-3 rounded-md border border-hairline bg-card p-4">
      <p className="m-0 text-body-sm text-ink-secondary">
        Listen before you use it. {clock(recording.seconds)}, {fileSize(recording.blob.size)}.
      </p>
      <AudioPlayer title={title} getUrl={async () => url} durationSeconds={recording.seconds} peaks={peaks} fileSize={recording.blob.size} />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onRerecord} disabled={disabled}>
          <RotateCcw aria-hidden="true" />
          Re-record
        </Button>
        <Button type="button" onClick={() => onUse(peaks)} disabled={disabled}>
          <Check aria-hidden="true" />
          Use recording
        </Button>
      </div>
    </div>
  );
}

/**
 * The live waveform: the latest levels as bars, newest on the right, in wave-recording. Under reduced
 * motion the bars update in place with no movement animation (there is none to remove).
 * @param {{ levels: number[], paused: boolean }} props
 */
function LiveWaveform({ levels, paused }) {
  const bars = 64;
  const padded = levels.length >= bars ? levels.slice(-bars) : [...Array(bars - levels.length).fill(0), ...levels];
  return (
    <div aria-hidden="true" data-slot="live-waveform" className={cn('wave-bars h-16 w-full overflow-hidden', paused && 'opacity-60')}>
      {padded.map((level, i) => (
        <span key={i} className="wave-bar bg-wave-recording" style={{ height: `${Math.max(6, Math.round(level * 100))}%` }} />
      ))}
    </div>
  );
}
