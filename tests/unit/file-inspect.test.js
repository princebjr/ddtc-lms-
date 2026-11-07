// Phase 6 server-side file checks (supabase/functions/_shared/audio.ts and documents.ts), on
// synthetic files built here: the real type comes from the bytes and the duration from the header;
// renamed files are refused. Test required: a renamed non-audio file is rejected; over-duration
// files are rejected (the limit is compared with this duration in finalize-upload).
import { describe, expect, it } from 'vitest';
import { cleanPeaks, inspectAudio } from '../../supabase/functions/_shared/audio.ts';
import { inspectDocument } from '../../supabase/functions/_shared/documents.ts';
import { concat, m4a, mp3, wav, zip } from '../fixtures/media.js';

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
