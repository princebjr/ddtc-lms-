import { useMemo } from 'react';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { ThemeSwitch } from '@/components/layout/ThemeSwitch.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';

// Audio design preview (ADR-006; development, CI and Vercel preview builds only): the living mockup
// of the waveform player in every size and state, with notes, for review in light and dark at any
// width. The audio is generated here (a 40-second tone that swells and fades), so no sign-in or
// upload is needed.

const SECONDS = 40;
const RATE = 8000;

/** A 16-bit mono WAV whose loudness rises and falls, so the waveform has a real shape. */
function makeTone() {
  const samples = SECONDS * RATE;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (/** @type {number} */ at, /** @type {string} */ s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i += 1) {
    const t = i / RATE;
    const loudness = 0.15 + 0.85 * Math.abs(Math.sin(t / 3)) * (0.6 + 0.4 * Math.sin(t * 1.7));
    view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 220 * t) * loudness * 12000), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** 128 peaks that match the tone above (what finalize-upload would store). */
const PEAKS = Array.from({ length: 128 }, (_, i) => {
  const t = (i / 128) * SECONDS;
  return Math.round((0.15 + 0.85 * Math.abs(Math.sin(t / 3)) * (0.6 + 0.4 * Math.sin(t * 1.7))) * 1000) / 1000;
});

/** @param {{ title: string, note: string, children: import('react').ReactNode }} props */
function Example({ title, note, children }) {
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{note}</CardDescription>
      {children}
    </Card>
  );
}

export default function AudioPreviewPage() {
  const url = useMemo(() => URL.createObjectURL(makeTone()), []);
  const ready = useMemo(() => async () => url, [url]);
  const never = useMemo(() => () => new Promise(() => {}), []);
  const broken = useMemo(() => async () => Promise.reject(new Error('expired')), []);
  const common = { title: 'Welcome and overview', subtitle: 'Introduction to Biblical Studies', durationSeconds: SECONDS, fileSize: SECONDS * RATE * 2 + 44, onDownload: () => {} };

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 py-8 pt-safe pb-safe sm:px-6 lg:px-8">
      <PageHeader title="Audio player" description="ADR-006: every size and state, light and dark. Preview builds only." actions={<ThemeSwitch />} />
      <div className="lg:hidden">
        <ThemeSwitch />
      </div>
      <Example
        title="Standard (lesson page)"
        note="Waveform from 128 stored peaks: played bars blue, the rest slate, a playhead with round handles. Tap to seek, drag to scrub with a time bubble; arrows seek 5 s. Current time left, time remaining right; 56 px play and pause, 15 s skips, speed, Download with size."
      >
        <AudioPlayer {...common} getUrl={ready} peaks={PEAKS} />
      </Example>
      <Example title="Compact (lists)" note="One row: 44 px play, waveform, time, and an icon-only Download with the size in its name.">
        <AudioPlayer {...common} size="compact" getUrl={ready} peaks={PEAKS} />
      </Example>
      <Example title="Full (grading)" note="A taller waveform for close listening while grading.">
        <AudioPlayer {...common} size="full" getUrl={ready} peaks={PEAKS} />
      </Example>
      <Example title="Peaks computed by the viewer" note="This file has no stored peaks and is under 10 minutes: the browser computes them, with skeleton bars meanwhile.">
        <AudioPlayer {...common} getUrl={ready} peaks={null} />
      </Example>
      <Example title="Long recording without peaks" note="Over 10 minutes and no stored peaks: even placeholder bars instead of downloading a large file.">
        <AudioPlayer {...common} durationSeconds={5400} getUrl={never} peaks={null} />
      </Example>
      <Example title="Loading" note="Skeleton bars while the signed link is prepared; controls wait.">
        <AudioPlayer {...common} getUrl={never} peaks={PEAKS} />
      </Example>
      <Example title="Error" note="The link could not be prepared: a clear message and Retry (asks for a fresh link). Offline shows its own message.">
        <AudioPlayer {...common} getUrl={broken} peaks={PEAKS} />
      </Example>
    </main>
  );
}
