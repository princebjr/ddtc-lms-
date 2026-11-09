import { useCallback, useEffect, useRef, useState } from 'react';
import { holdAwake } from '@/lib/auth/activity.js';
import { extensionForMime, pickRecordingFormat, RECORDING_BITS_PER_SECOND, recorderSupported } from '@/lib/recording/format.js';
import { pushLevel, rmsLevel, silenceTracker } from '@/lib/recording/levels.js';
import { appendRecordingChunk, clearRecordingDraft, startRecordingDraft } from '@/lib/recording/recording-drafts.js';

// The browser recorder (Phase 8; DESIGN.md 13; BUILD_PLAN 15.4; ADR-006; D43): MediaRecorder in the
// first format the browser offers, pieces every second (kept as a draft on this device), a live
// level for the waveform, a warning after 5 seconds of silence, and an automatic stop at the time or
// size limit. While recording the screen is kept awake where the browser allows it (Wake Lock) and
// the user counts as active (nobody is signed out mid-recording, D43). Leaving the app pauses the
// recording; when the microphone was cut meanwhile (iPhone), Resume keeps what was recorded.

/** @typedef {'idle' | 'starting' | 'recording' | 'paused' | 'stopped' | 'denied' | 'unsupported' | 'error'} RecorderState */
/** @typedef {'limit' | 'background' | 'ended' | null} RecorderNotice */
/** @typedef {{ blob: Blob, mimeType: string, seconds: number, extension: string }} Recording */

/**
 * @typedef {object} Live
 * @property {MediaStream} stream
 * @property {MediaRecorder} recorder
 * @property {Blob[]} chunks
 * @property {number} bytes
 * @property {number} elapsed  milliseconds recorded before the current stretch
 * @property {number} stretchStart
 * @property {() => void} release
 * @property {WakeLockSentinel | null} wakeLock
 * @property {string} mimeType
 * @property {ReturnType<typeof silenceTracker>} silence
 * @property {AudioContext | null} context
 * @property {AnalyserNode | null} analyser
 * @property {number} timer
 * @property {boolean} discard
 * @property {boolean} unmounted
 */

/** @param {Live} l */
const elapsedSeconds = (l) => (l.elapsed + (l.recorder.state === 'recording' ? performance.now() - l.stretchStart : 0)) / 1000;

/** @param {Live} l */
async function keepScreenOn(l) {
  try {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    await l.wakeLock?.release();
    l.wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // Not offered (or refused): recording works the same.
  }
}

/** @param {Live} l */
function release(l) {
  window.clearInterval(l.timer);
  for (const track of l.stream.getTracks()) track.stop();
  l.context?.close().catch(() => undefined);
  l.wakeLock?.release().catch(() => undefined);
  l.release();
}

/**
 * @param {{ maxSeconds: number, maxBytes: number, draft?: { userId: string, key: string } | null, bars?: number }} options
 */
export function useRecorder({ maxSeconds, maxBytes, draft = null, bars = 64 }) {
  const [state, setState] = useState(/** @type {RecorderState} */ (recorderSupported() ? 'idle' : 'unsupported'));
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState(/** @type {number[]} */ ([]));
  const [silent, setSilent] = useState(false);
  const [recording, setRecording] = useState(/** @type {Recording | null} */ (null));
  const [notice, setNotice] = useState(/** @type {RecorderNotice} */ (null));
  const live = useRef(/** @type {Live | null} */ (null));
  const draftUser = draft?.userId;
  const draftKey = draft?.key;

  const finish = useCallback(() => {
    const l = live.current;
    if (l && l.recorder.state !== 'inactive') l.recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (!recorderSupported()) {
      setState('unsupported');
      return;
    }
    setState('starting');
    setNotice(null);
    setSilent(false);
    setLevels([]);
    setSeconds(0);
    setRecording(null);
    /** @type {MediaStream} */
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      const name = /** @type {{ name?: string }} */ (error)?.name;
      setState(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'unsupported'
            : 'error',
      );
      return;
    }
    const format = pickRecordingFormat((t) => MediaRecorder.isTypeSupported(t));
    /** @type {MediaRecorder} */
    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(format ? { mimeType: format.mimeType } : {}),
        audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
      });
    } catch {
      recorder = new MediaRecorder(stream);
    }
    const mimeType = recorder.mimeType || format?.mimeType || 'audio/webm';
    /** @type {Live} */
    const l = {
      stream,
      recorder,
      chunks: [],
      bytes: 0,
      elapsed: 0,
      stretchStart: performance.now(),
      release: holdAwake(),
      wakeLock: null,
      mimeType,
      silence: silenceTracker(),
      context: null,
      analyser: null,
      timer: 0,
      discard: false,
      unmounted: false,
    };
    live.current = l;
    try {
      const Context = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
      const context = /** @type {AudioContext} */ (new Context());
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      l.context = context;
      l.analyser = analyser;
    } catch {
      // No level meter: the recording itself is unaffected.
    }
    if (draftUser && draftKey) void startRecordingDraft(draftUser, draftKey, mimeType);
    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      l.chunks.push(event.data);
      l.bytes += event.data.size;
      if (draftUser && draftKey && !l.discard) void appendRecordingChunk(draftUser, draftKey, event.data, elapsedSeconds(l));
      if (l.bytes >= maxBytes * 0.97 && l.recorder.state !== 'inactive') {
        setNotice('limit');
        l.recorder.stop();
      }
    };
    recorder.onstop = () => {
      const secs = elapsedSeconds(l);
      release(l);
      if (live.current === l) live.current = null;
      if (l.unmounted) return;
      if (l.discard) {
        setState('idle');
        setSeconds(0);
        setLevels([]);
        return;
      }
      setRecording({
        blob: new Blob(l.chunks, { type: mimeType }),
        mimeType,
        seconds: secs,
        extension: extensionForMime(mimeType),
      });
      setSeconds(secs);
      setSilent(false);
      setState('stopped');
    };
    recorder.start(1000);
    void keepScreenOn(l);
    const sample = l.analyser ? new Uint8Array(l.analyser.fftSize) : null;
    l.timer = window.setInterval(() => {
      const secs = elapsedSeconds(l);
      setSeconds(secs);
      if (l.recorder.state === 'recording' && l.analyser && sample) {
        l.analyser.getByteTimeDomainData(sample);
        const level = rmsLevel(sample);
        setLevels((prev) => pushLevel(prev, level, bars));
        setSilent(l.silence.feed(level, performance.now()));
      }
      if (secs >= maxSeconds && l.recorder.state !== 'inactive') {
        setNotice('limit');
        l.recorder.stop();
      }
    }, 100);
    setState('recording');
  }, [bars, draftKey, draftUser, maxBytes, maxSeconds]);

  const pause = useCallback(() => {
    const l = live.current;
    if (!l || l.recorder.state !== 'recording') return;
    l.elapsed += performance.now() - l.stretchStart;
    l.recorder.pause();
    l.silence.reset();
    setSilent(false);
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    const l = live.current;
    if (!l || l.recorder.state !== 'paused') return;
    // The microphone may have been cut while the app was in the background: keep what was recorded.
    if (l.stream.getAudioTracks().some((t) => t.readyState === 'ended')) {
      setNotice('ended');
      l.recorder.stop();
      return;
    }
    l.stretchStart = performance.now();
    l.recorder.resume();
    setNotice(null);
    setState('recording');
  }, []);

  /** Throws the recording away (in progress or finished) and its draft. */
  const discard = useCallback(() => {
    const l = live.current;
    if (l) {
      l.discard = true;
      if (l.recorder.state !== 'inactive') l.recorder.stop();
    }
    setRecording(null);
    setNotice(null);
    setState(recorderSupported() ? 'idle' : 'unsupported');
    setSeconds(0);
    setLevels([]);
    if (draftUser && draftKey) void clearRecordingDraft(draftUser, draftKey);
  }, [draftKey, draftUser]);

  /** Puts a recording back for review (a restored draft). */
  const restore = useCallback((/** @type {Recording} */ r) => {
    setRecording(r);
    setSeconds(r.seconds);
    setState('stopped');
  }, []);

  // Leaving the app pauses the recording (iPhone stops the microphone in the background anyway).
  useEffect(() => {
    const onVisibility = () => {
      const l = live.current;
      if (!l) return;
      if (document.visibilityState === 'hidden' && l.recorder.state === 'recording') {
        l.elapsed += performance.now() - l.stretchStart;
        l.recorder.pause();
        setNotice('background');
        setState('paused');
      } else if (document.visibilityState === 'visible') {
        void keepScreenOn(l);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Leaving the screen stops the microphone; the pieces already saved stay as the draft.
  useEffect(
    () => () => {
      const l = live.current;
      if (!l) return;
      l.unmounted = true;
      if (l.recorder.state !== 'inactive') l.recorder.stop();
      else release(l);
      live.current = null;
    },
    [],
  );

  return {
    state,
    seconds,
    levels,
    silent,
    recording,
    notice,
    start,
    pause,
    resume,
    stop: finish,
    discard,
    restore,
    maxSeconds,
  };
}
