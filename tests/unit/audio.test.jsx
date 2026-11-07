// @vitest-environment jsdom
// ADR-006 audio player: time text, peaks fitted to the bars, the Waveform slider (keyboard, tap and
// drag, spoken value, loading skeleton) and the AudioPlayer (no autoplay, metadata-only preload,
// play and pause, skip, speed, Download with size, error with Retry).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer, END_GUARD_SECONDS } from '@/components/audio/AudioPlayer.jsx';
import { Waveform } from '@/components/audio/Waveform.jsx';
import { clock, fileSize, spoken } from '@/lib/audio/format.js';
import { barsForWidth, resamplePeaks } from '@/lib/audio/peaks.js';

describe('time and size text', () => {
  it('shows a clock for the eye and words for screen readers', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(760)).toBe('12:40');
    expect(clock(3725)).toBe('1:02:05');
    expect(clock(Number.NaN)).toBe('0:00');
    expect(spoken(80)).toBe('1 minute 20 seconds');
    expect(spoken(760)).toBe('12 minutes 40 seconds');
    expect(spoken(3601)).toBe('1 hour 1 second');
    expect(spoken(0)).toBe('0 seconds');
  });

  it('shows file sizes in KB and MB', () => {
    expect(fileSize(870_000)).toBe('850 KB');
    expect(fileSize(13_002_342)).toBe('12.4 MB');
    expect(fileSize(0)).toBe('');
  });
});

describe('peaks', () => {
  it('fits 128 peaks to the bar count, keeping each bar loudest moment', () => {
    const peaks = Array.from({ length: 128 }, (_, i) => (i === 70 ? 1 : 0.2));
    const bars = resamplePeaks(peaks, 48);
    expect(bars).toHaveLength(48);
    expect(Math.max(...bars)).toBe(1);
    expect(bars.filter((b) => b === 1)).toHaveLength(1);
  });

  it('fits 3 px bars with 2 px gaps to the width (about 48 on a phone, 120 on a desktop)', () => {
    expect(barsForWidth(238)).toBe(48);
    expect(barsForWidth(598)).toBe(120);
    expect(barsForWidth(20)).toBe(16);
  });
});

describe('Waveform', () => {
  const peaks = Array.from({ length: 128 }, (_, i) => (i % 10) / 10);

  it('is a slider with the time in words', () => {
    render(<Waveform peaks={peaks} state="ready" currentSeconds={80} durationSeconds={760} onSeek={() => {}} label="Lesson audio position" />);
    const slider = screen.getByRole('slider', { name: 'Lesson audio position' });
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '760');
    expect(slider).toHaveAttribute('aria-valuenow', '80');
    expect(slider).toHaveAttribute('aria-valuetext', '1 minute 20 seconds of 12 minutes 40 seconds');
  });

  it('seeks 5 s with the arrow keys, 15 s with Page Up and Page Down, and to either end with Home and End', () => {
    const onSeek = vi.fn();
    render(<Waveform peaks={peaks} state="ready" currentSeconds={80} durationSeconds={760} onSeek={onSeek} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onSeek.mock.calls.map((c) => c[0])).toEqual([85, 75, 95, 0, 760]);
  });

  it('seeks where you tap, and shows a time bubble while dragging', () => {
    const onSeek = vi.fn();
    render(<Waveform peaks={peaks} state="ready" currentSeconds={0} durationSeconds={600} onSeek={onSeek} />);
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => /** @type {DOMRect} */ ({ left: 100, width: 400, top: 0, height: 56, right: 500, bottom: 56, x: 100, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 1 });
    expect(document.querySelector('[data-slot="time-bubble"]')?.textContent).toBe('5:00');
    expect(slider).toHaveAttribute('aria-valuetext', '5 minutes of 10 minutes');
    fireEvent.pointerUp(slider, { clientX: 300, pointerId: 1 });
    expect(onSeek).toHaveBeenCalledWith(300);
    expect(document.querySelector('[data-slot="time-bubble"]')).toBeNull();
  });

  it('still drags when the browser refuses pointer capture (seen in Firefox and WebKit)', () => {
    const onSeek = vi.fn();
    render(<Waveform peaks={peaks} state="ready" currentSeconds={0} durationSeconds={600} onSeek={onSeek} />);
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => /** @type {DOMRect} */ ({ left: 0, width: 600, top: 0, height: 56, right: 600, bottom: 56, x: 0, y: 0, toJSON: () => ({}) });
    slider.setPointerCapture = () => {
      throw new DOMException('Invalid pointer id', 'NotFoundError');
    };
    fireEvent.pointerDown(slider, { clientX: 60, pointerId: 0 });
    fireEvent.pointerMove(slider, { clientX: 150, pointerId: 0 });
    expect(document.querySelector('[data-slot="time-bubble"]')?.textContent).toBe('2:30');
    fireEvent.pointerUp(slider, { clientX: 150, pointerId: 0 });
    expect(onSeek).toHaveBeenCalledWith(150);
  });

  it('colours the played part and marks it for assistive tests, never colour alone (playhead and time)', () => {
    const { container } = render(<Waveform peaks={peaks} state="ready" currentSeconds={300} durationSeconds={600} onSeek={() => {}} />);
    const bars = container.querySelectorAll('.wave-bar');
    const played = container.querySelectorAll('.wave-bar[data-played="true"]');
    expect(bars.length).toBeGreaterThan(0);
    expect(played.length).toBe(Math.round(bars.length / 2));
    expect(container.querySelector('.wave-playhead')).not.toBeNull();
  });

  it('shows skeleton bars while peaks load, and does not take input without a duration', () => {
    const onSeek = vi.fn();
    const { container } = render(<Waveform peaks={null} state="loading" currentSeconds={0} durationSeconds={0} onSeek={onSeek} />);
    expect(container.querySelectorAll('.wave-bar.skeleton-shimmer').length).toBeGreaterThan(0);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-busy', 'true');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe('AudioPlayer', () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let play;
  /** @type {ReturnType<typeof vi.spyOn>} */
  let pause;
  beforeEach(() => {
    play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(/** @this {HTMLMediaElement} */ function play() {
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    });
    pause = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(/** @this {HTMLMediaElement} */ function pause() {
      this.dispatchEvent(new Event('pause'));
    });
  });
  afterEach(() => {
    play.mockRestore();
    pause.mockRestore();
  });

  const props = {
    title: 'Welcome and overview',
    subtitle: 'Introduction to Biblical Studies',
    durationSeconds: 760,
    peaks: Array.from({ length: 128 }, () => 0.5),
    fileSize: 13_002_342,
  };

  it('never autoplays and preloads metadata only', async () => {
    const { container } = render(<AudioPlayer {...props} getUrl={async () => 'https://example.test/a.mp3'} onDownload={() => {}} />);
    await act(async () => {});
    const audio = /** @type {HTMLAudioElement} */ (container.querySelector('audio'));
    expect(audio.getAttribute('preload')).toBe('metadata');
    expect(audio.autoplay).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('plays and pauses, skips 15 s, changes speed, and offers Download with the size', async () => {
    const onDownload = vi.fn();
    const { container } = render(<AudioPlayer {...props} getUrl={async () => 'https://example.test/a.mp3'} onDownload={onDownload} />);
    await act(async () => {});
    const audio = /** @type {HTMLAudioElement} */ (container.querySelector('audio'));

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play Welcome and overview' })));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pause Welcome and overview' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause Welcome and overview' })));
    expect(pause).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(audio.currentTime).toBe(15);
    fireEvent.click(screen.getByRole('button', { name: 'Back 15 seconds' }));
    expect(audio.currentTime).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Download (12.4 MB)' }));
    expect(onDownload).toHaveBeenCalled();
    expect(screen.getByText('-12:40')).toBeInTheDocument();
  });

  // Told to seek exactly to the end, Firefox fails to decode a WAV file and WebKit on Linux asks for
  // bytes past the end of the file; both then report the audio as broken (found in CI on Phase 6).
  it('never seeks exactly to the end: End stops just short and shows the end, and Play there starts again', async () => {
    const { container } = render(<AudioPlayer {...props} getUrl={async () => 'https://example.test/a.mp3'} onDownload={() => {}} />);
    await act(async () => {});
    const audio = /** @type {HTMLAudioElement} */ (container.querySelector('audio'));
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'End' });
    expect(END_GUARD_SECONDS).toBeGreaterThan(0);
    expect(audio.currentTime).toBeCloseTo(760 - END_GUARD_SECONDS, 6);
    expect(slider).toHaveAttribute('aria-valuenow', '760');
    expect(slider).toHaveAttribute('aria-valuetext', '12 minutes 40 seconds of 12 minutes 40 seconds');
    expect(screen.getByText('12:40')).toBeInTheDocument();
    expect(screen.getByText('-0:00')).toBeInTheDocument();

    // From the end the arrows count from the end the person sees; the skip and drag stop short too.
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(audio.currentTime).toBe(755);
    fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(audio.currentTime).toBeCloseTo(760 - END_GUARD_SECONDS, 6);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play Welcome and overview' })));
    expect(audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('shows an error with Retry, and Retry asks for a fresh link', async () => {
    let calls = 0;
    const getUrl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('expired');
      return 'https://example.test/a.mp3';
    });
    render(<AudioPlayer {...props} getUrl={getUrl} />);
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('The audio could not be loaded.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(getUrl).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the compact size fits one row with a labelled Download button', async () => {
    render(<AudioPlayer {...props} size="compact" getUrl={async () => 'https://example.test/a.mp3'} onDownload={() => {}} />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Download audio, 12.4 MB' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forward 15 seconds' })).toBeNull();
  });
});
