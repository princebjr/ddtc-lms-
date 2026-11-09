// Phase 6 server-side file checks (supabase/functions/_shared/audio.ts and documents.ts), on
// synthetic files built here: the real type comes from the bytes and the duration from the header;
// renamed files are refused. Test required: a renamed non-audio file is rejected; over-duration
// files are rejected (the limit is compared with this duration in finalize-upload).
import { describe, expect, it } from 'vitest';
import { cleanPeaks, inspectAudio } from '../../supabase/functions/_shared/audio.ts';
import { inspectDocument } from '../../supabase/functions/_shared/documents.ts';
import { concat, fmp4, m4a, mp3, ogg, wav, webm, zip } from '../fixtures/media.js';

/** A ranged reader over bytes, as finalize-upload reads Storage. @param {Uint8Array} bytes */
function reader(bytes) {
  return { size: bytes.length, read: async (/** @type {number} */ offset, /** @type {number} */ length) => bytes.slice(offset, offset + length) };
}

describe('inspectAudio', () => {
  it('reads WAV duration from its header', async () => {
    expect(await inspectAudio(reader(wav(3)))).toEqual({ mime: 'audio/wav', durationSeconds: 3 });
  });

  it('reads constant-bit-rate MP3 after an ID3 tag', async () => {
    const facts = await inspectAudio(reader(mp3({ frames: 100 })));
    expect(facts?.mime).toBe('audio/mpeg');
    expect(facts?.durationSeconds).toBeCloseTo((100 * 417 * 8) / 128000, 3);
  });

  it('reads variable-bit-rate MP3 duration from the Xing header (frame count)', async () => {
    const facts = await inspectAudio(reader(mp3({ frames: 10, xingFrames: 248000 })));
    expect(facts?.mime).toBe('audio/mpeg');
    expect(facts?.durationSeconds).toBeCloseTo((248000 * 1152) / 44100, 3); // about 108 minutes: over the 90-minute limit
  });

  it('reads M4A duration from mvhd even when moov comes after the media data', async () => {
    expect(await inspectAudio(reader(m4a({ seconds: 754 })))).toEqual({ mime: 'audio/mp4', durationSeconds: 754 });
  });

  it('refuses a video file renamed to .m4a (it has a video track)', async () => {
    expect(await inspectAudio(reader(m4a({ seconds: 30, handler: 'vide' })))).toBeNull();
  });

  it('refuses renamed non-audio files: PDF, JPEG, ZIP and random bytes', async () => {
    expect(await inspectAudio(reader(concat('%PDF-1.7\n', new Uint8Array(5000))))).toBeNull();
    expect(await inspectAudio(reader(concat([0xff, 0xd8, 0xff, 0xe0], new Uint8Array(5000))))).toBeNull();
    expect(await inspectAudio(reader(zip(['[Content_Types].xml'])))).toBeNull();
    expect(await inspectAudio(reader(Uint8Array.from({ length: 8000 }, (_, i) => (i * 37) % 251)))).toBeNull();
    expect(await inspectAudio(reader(new Uint8Array(4)))).toBeNull();
  });
});

// Phase 8: browsers record in WebM (Chrome, Android), Ogg (Firefox) or fragmented MP4 (Safari), and
// those files rarely state their own length, so the length is worked out from the end of the file.
describe('inspectAudio: browser recordings (Phase 8)', () => {
  it('works out a WebM recording\'s length from its last cluster when it has no Duration (Chrome)', async () => {
    expect(await inspectAudio(reader(webm({ seconds: 754 })))).toEqual({ mime: 'audio/webm', durationSeconds: 754 });
  });

  it('uses a WebM Duration when there is one', async () => {
    expect(await inspectAudio(reader(webm({ seconds: 95, withDuration: true })))).toEqual({ mime: 'audio/webm', durationSeconds: 95 });
  });

  it('is not fooled by a cluster id inside the audio data', async () => {
    expect(await inspectAudio(reader(webm({ seconds: 754, fakeCluster: true })))).toEqual({ mime: 'audio/webm', durationSeconds: 754 });
  });

  it('refuses a WebM with a video track, and Matroska that is not WebM', async () => {
    expect(await inspectAudio(reader(webm({ seconds: 30, video: true })))).toBeNull();
    expect(await inspectAudio(reader(webm({ seconds: 30, docType: 'matroska' })))).toBeNull();
  });

  it('reads an Ogg Opus recording\'s length from its last page, less the pre-skip (Firefox)', async () => {
    expect(await inspectAudio(reader(ogg({ seconds: 754 })))).toEqual({ mime: 'audio/ogg', durationSeconds: 754 });
  });

  it('reads Ogg Vorbis too, and refuses Ogg with a video stream', async () => {
    expect(await inspectAudio(reader(ogg({ seconds: 120, codec: 'vorbis' })))).toEqual({ mime: 'audio/ogg', durationSeconds: 120 });
    expect(await inspectAudio(reader(ogg({ seconds: 30, video: true })))).toBeNull();
  });

  it('works out a fragmented MP4 recording\'s length from its last fragment (Safari)', async () => {
    expect(await inspectAudio(reader(fmp4({ seconds: 754 })))).toEqual({ mime: 'audio/mp4', durationSeconds: 754 });
  });

  it('uses the movie-extends header when a fragmented MP4 has one', async () => {
    expect(await inspectAudio(reader(fmp4({ seconds: 600, mehd: true })))).toEqual({ mime: 'audio/mp4', durationSeconds: 600 });
  });

  it('adds up every fragment when they carry no start times, with default sample durations', async () => {
    const facts = await inspectAudio(reader(fmp4({ seconds: 120, tfdt: false, perSample: false })));
    expect(facts?.mime).toBe('audio/mp4');
    // With a default duration every frame is a whole 1024 samples: 60 fragments of 94 frames.
    expect(facts?.durationSeconds).toBeCloseTo((60 * 94 * 1024) / 48000, 3);
  });

  it('keeps recordings over the 10-minute answer limit measurable (finalize-upload compares)', async () => {
    expect((await inspectAudio(reader(webm({ seconds: 601 }))))?.durationSeconds).toBeGreaterThan(600);
    expect((await inspectAudio(reader(ogg({ seconds: 601 }))))?.durationSeconds).toBeGreaterThan(600);
    expect((await inspectAudio(reader(fmp4({ seconds: 601 }))))?.durationSeconds).toBeGreaterThan(600);
  });
});

describe('cleanPeaks', () => {
  it('keeps exactly 128 values from 0 to 1 and refuses anything else', () => {
    expect(cleanPeaks(Array.from({ length: 128 }, (_, i) => i / 127))?.length).toBe(128);
    expect(cleanPeaks(Array.from({ length: 64 }, () => 0.5))).toBeNull();
    expect(cleanPeaks([...Array.from({ length: 127 }, () => 0.5), 1.5])).toBeNull();
    expect(cleanPeaks([...Array.from({ length: 127 }, () => 0.5), 'x'])).toBeNull();
    expect(cleanPeaks('peaks')).toBeNull();
  });
});

describe('inspectDocument', () => {
  it('recognises PDF, DOCX and PPTX by content', async () => {
    expect(await inspectDocument(reader(concat('%PDF-1.7\n', new Uint8Array(100))))).toBe('application/pdf');
    expect(await inspectDocument(reader(zip(['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(await inspectDocument(reader(zip(['[Content_Types].xml', 'ppt/presentation.xml'])))).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
  });

  it('refuses macros, plain ZIP files and anything else', async () => {
    expect(await inspectDocument(reader(zip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin'])))).toBeNull();
    expect(await inspectDocument(reader(zip(['notes.txt'])))).toBeNull();
    expect(await inspectDocument(reader(wav(1)))).toBeNull();
    expect(await inspectDocument(reader(concat([0xff, 0xd8, 0xff], new Uint8Array(100))))).toBeNull();
  });
});
