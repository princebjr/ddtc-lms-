// @vitest-environment jsdom
// Phase 8 recorder (DESIGN.md 13, ADR-006; BUILD_PLAN 15.4; D43): the format each browser records in,
// loudness and the 5-second silence warning, recording drafts kept on the device (IndexedDB, 24
// hours, deleted by a deliberate sign-out), and the recorder's states with a fake MediaRecorder and
// microphone: unsupported and blocked (with the upload way out), recording with Pause and Resume,
// the automatic stop at the limit, review, Use recording and Re-record. Real browsers are covered
// end to end and on real devices (the phase's exit gate).
import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Recorder } from '@/components/recorder/Recorder.jsx';
import { clearUserDrafts, resumeDrafts, stopDrafts } from '@/lib/drafts.js';
import { extensionForMime, LEARNER_RECORDING, pickRecordingFormat, recordingFileName } from '@/lib/recording/format.js';
import { pushLevel, rmsLevel, silenceTracker } from '@/lib/recording/levels.js';
import {
  appendRecordingChunk,
  clearRecordingDraft,
  loadRecordingDraft,
  RECORDING_DRAFT_TTL_MS,
  startRecordingDraft,
} from '@/lib/recording/recording-drafts.js';

const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));

describe('recording formats', () => {
  it('asks for MP4 with AAC first (plays everywhere), then WebM, then Ogg, then plain MP4', () => {
    expect(pickRecordingFormat((t) => t.startsWith('audio/mp4'))).toEqual({ mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' }); // Safari
    expect(pickRecordingFormat((t) => t.startsWith('audio/webm'))).toEqual({ mimeType: 'audio/webm;codecs=opus', extension: 'webm' }); // Chrome, Android
    expect(pickRecordingFormat((t) => t.startsWith('audio/ogg'))).toEqual({ mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' }); // Firefox
    expect(pickRecordingFormat((t) => t === 'audio/mp4')).toEqual({ mimeType: 'audio/mp4', extension: 'm4a' }); // older Safari
    expect(pickRecordingFormat(() => false)).toBeNull();
    expect(
      pickRecordingFormat(() => {
        throw new Error('unknown');
      }),
    ).toBeNull();
  });

  it('names the file by what was really recorded, with the Ghana date and time', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForMime('audio/ogg; codecs=opus')).toBe('ogg');
    expect(extensionForMime('audio/mp4')).toBe('m4a');
    expect(recordingFileName(new Date('2026-11-09T14:05:00Z'), 'webm')).toBe('Recording 9 Nov 2026 14.05.webm');
  });
});

describe('loudness and silence', () => {
  it('silence is 0 and speech fills most of a bar', () => {
    expect(rmsLevel(new Uint8Array(512).fill(128))).toBe(0);
    expect(rmsLevel(Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 168 : 88)))).toBeGreaterThan(0.8);
  });

  it('warns after 5 seconds of near silence and clears at once on sound', () => {
    const t = silenceTracker();
    expect(t.feed(0, 0)).toBe(false);
    expect(t.feed(0.01, 4999)).toBe(false);
    expect(t.feed(0.01, 5000)).toBe(true);
    expect(t.feed(0.3, 5100)).toBe(false);
    expect(t.feed(0, 5200)).toBe(false);
  });

  it('keeps the latest levels, newest last', () => {
    expect(pushLevel([0.1, 0.2, 0.3], 0.4, 3)).toEqual([0.2, 0.3, 0.4]);
    expect(pushLevel([], 0.5, 3)).toEqual([0.5]);
  });
});

describe('recording drafts (D43)', () => {
  beforeEach(async () => {
    resumeDrafts();
    await clearRecordingDraft('u1', 'answer:a1');
  });

  it('keep the pieces of a recording per user and screen, and put them back as one file', async () => {
    await startRecordingDraft('u1', 'answer:a1', 'audio/webm');
    await appendRecordingChunk('u1', 'answer:a1', new Blob(['abc']), 1);
    await appendRecordingChunk('u1', 'answer:a1', new Blob(['def']), 2);
    const draft = await loadRecordingDraft('u1', 'answer:a1');
    expect(draft?.mimeType).toBe('audio/webm');
    expect(draft?.seconds).toBe(2);
    expect(await draft?.blob.text()).toBe('abcdef');
    expect(await loadRecordingDraft('u2', 'answer:a1')).toBeNull();
  });

  it('are gone after 24 hours', async () => {
    const now = Date.now();
    await startRecordingDraft('u1', 'answer:a1', 'audio/webm', now);
    await appendRecordingChunk('u1', 'answer:a1', new Blob(['abc']), 1, now);
    expect(await loadRecordingDraft('u1', 'answer:a1', now + RECORDING_DRAFT_TTL_MS + 1)).toBeNull();
    expect(await loadRecordingDraft('u1', 'answer:a1', now)).toBeNull();
  });

  it('are deleted by a deliberate sign-out, and nothing is kept for that user until they sign in again', async () => {
    await startRecordingDraft('u1', 'answer:a1', 'audio/webm');
    await appendRecordingChunk('u1', 'answer:a1', new Blob(['abc']), 1);
    stopDrafts('u1');
    await new Promise((r) => setTimeout(r, 20));
    expect(await loadRecordingDraft('u1', 'answer:a1')).toBeNull();
    await startRecordingDraft('u1', 'answer:a1', 'audio/webm');
    await appendRecordingChunk('u1', 'answer:a1', new Blob(['late']), 1);
    expect(await loadRecordingDraft('u1', 'answer:a1')).toBeNull();
    resumeDrafts();
    clearUserDrafts('u1');
  });
});

// ---------------------------------------------------------------- a fake microphone and MediaRecorder
class FakeRecorder {
  static instances = /** @type {FakeRecorder[]} */ ([]);
  static isTypeSupported = (/** @type {string} */ t) => t.startsWith('audio/webm');
  /** @param {any} stream @param {{ mimeType?: string }} [options] */
  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType ?? 'audio/webm';
    this.state = 'inactive';
    /** @type {((e: { data: Blob }) => void) | null} */
    this.ondataavailable = null;
    /** @type {(() => void) | null} */
    this.onstop = null;
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['sound'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn(), readyState: 'live' };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };

/** @param {{ onUse?: any, onUploadInstead?: any }} [props] */
function renderRecorder(props = {}) {
  return render(<Recorder limits={LEARNER_RECORDING} audience="learner" onUse={props.onUse ?? vi.fn()} onUploadInstead={props.onUploadInstead} />);
}

describe('the recorder', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    toast.show.mockReset();
    FakeRecorder.instances = [];
    track.readyState = 'live';
    Object.assign(window, { MediaRecorder: FakeRecorder });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } });
    URL.createObjectURL = vi.fn(() => 'blob:recording');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error removed again after each test
    delete window.MediaRecorder;
  });

  it('offers an upload when the browser cannot record', () => {
    // @ts-expect-error a browser without MediaRecorder
    delete window.MediaRecorder;
    const onUploadInstead = vi.fn();
    renderRecorder({ onUploadInstead });
    expect(screen.getByRole('status')).toHaveTextContent('cannot record here');
    fireEvent.click(screen.getByRole('button', { name: 'Upload a recording' }));
    expect(onUploadInstead).toHaveBeenCalled();
  });

  it('a blocked microphone says so, with "Microphone blocked. Upload a file instead" and the upload way out', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    const onUploadInstead = vi.fn();
    renderRecorder({ onUploadInstead });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start recording' })));
    expect(screen.getByRole('status')).toHaveTextContent('The microphone is blocked');
    expect(toast.show).toHaveBeenCalledWith('learner.microphone-blocked', { onAction: onUploadInstead });
  });

  it('records with a timer, pauses and resumes, then stops for review; Use recording hands over the file', async () => {
    const onUse = vi.fn();
    renderRecorder({ onUse });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start recording' })));
    expect(screen.getByText('Recording')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(65_000));
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText('8:55 left')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Paused')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByText('1:05')).toBeInTheDocument(); // paused time does not count
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    expect(screen.getByRole('button', { name: 'Use recording' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use recording' }));
    expect(toast.show).toHaveBeenCalledWith('learner.recording-saved');
    const [file, facts] = onUse.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toMatch(/^Recording .+\.webm$/);
    expect(file.type).toBe('audio/webm');
    expect(facts.seconds).toBeCloseTo(65, 0);
    expect(track.stop).toHaveBeenCalled(); // the microphone is released
  });

  it('stops by itself at the 10-minute limit', async () => {
    renderRecorder();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start recording' })));
    await act(async () => vi.advanceTimersByTime(600_200));
    expect(screen.getByRole('button', { name: 'Use recording' })).toBeInTheDocument();
  });

  it('Re-record throws the recording away with "Recording discarded"', async () => {
    renderRecorder();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start recording' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    fireEvent.click(screen.getByRole('button', { name: 'Re-record' }));
    expect(toast.show).toHaveBeenCalledWith('learner.recording-discarded');
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument();
  });

  it('leaving the app pauses the recording and says how to carry on', async () => {
    renderRecorder();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start recording' })));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText(/Recording paused because you left the app/)).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('when the microphone was cut meanwhile (iPhone), Resume keeps what was recorded', async () => {
    renderRecorder();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start recording' })));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    track.readyState = 'ended';
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resume' })));
    expect(screen.getByRole('button', { name: 'Use recording' })).toBeInTheDocument();
  });
});
