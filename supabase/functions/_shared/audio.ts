// Audio checks for the D18 pipeline (finalize-upload): the real type from the bytes, never the name
// or the browser, and the duration from the file's own header. Only small ranges are read, so a
// 90-minute, 100 MB lesson stays within an Edge Function's memory and CPU limits.
// Pure code with no imports: unit-tested in tests/unit/audio-inspect.test.js.

export type Reader = { size: number; read(offset: number, length: number): Promise<Uint8Array> };
export type AudioMime = 'audio/mpeg' | 'audio/mp4' | 'audio/wav';
export type AudioFacts = { mime: AudioMime; durationSeconds: number };

/** Starts of common non-audio files (PDF, ZIP/Office, JPEG, PNG, GIF): never scanned for MP3 frames. */
const KNOWN_OTHER = [
  [0x25, 0x50, 0x44, 0x46],
  [0x50, 0x4b, 0x03, 0x04],
  [0xff, 0xd8, 0xff],
  [0x89, 0x50, 0x4e, 0x47],
  [0x47, 0x49, 0x46, 0x38],
];

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u32le = (b: Uint8Array, at: number) => b[at] + (b[at + 1] << 8) + (b[at + 2] << 16) + ((b[at + 3] << 24) >>> 0);

/** The file's real audio type and duration, or null when it is not a supported audio file. */
export async function inspectAudio(r: Reader): Promise<AudioFacts | null> {
  if (r.size < 12) return null;
  const head = await r.read(0, Math.min(r.size, 64 * 1024));
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') return wav(r);
  if (ascii(head, 4, 4) === 'ftyp') return mp4(r);
  if (KNOWN_OTHER.some((sig) => sig.every((v, i) => head[i] === v))) return null;
  return mp3(r, head);
}

// ---------------------------------------------------------------- WAV
async function wav(r: Reader): Promise<AudioFacts | null> {
  let offset = 12;
  let byteRate = 0;
  for (let i = 0; i < 64 && offset + 8 <= r.size; i += 1) {
    const h = await r.read(offset, 8);
    const id = ascii(h, 0, 4);
    const size = u32le(h, 4);
    if (id === 'fmt ') {
      const fmt = await r.read(offset + 8, 16);
      byteRate = u32le(fmt, 8);
    } else if (id === 'data') {
      if (!byteRate) return null;
      const dataStart = offset + 8;
      const dataSize = size === 0 || size === 0xffffffff || dataStart + size > r.size ? r.size - dataStart : size;
      return { mime: 'audio/wav', durationSeconds: dataSize / byteRate };
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

// ---------------------------------------------------------------- MP4 / M4A
// Walks the top-level boxes to `moov`, reads its `mvhd` for the duration, and requires a sound
// track and no video track (a renamed video is not lesson audio).
async function mp4(r: Reader): Promise<AudioFacts | null> {
  let offset = 0;
  for (let i = 0; i < 64 && offset + 8 <= r.size; i += 1) {
    const h = await r.read(offset, 16);
    let size = u32be(h, 0);
    const type = ascii(h, 4, 4);
    let header = 8;
    if (size === 1) {
      size = u32be(h, 8) * 2 ** 32 + u32be(h, 12);
      header = 16;
    } else if (size === 0) {
      size = r.size - offset;
    }
    if (size < header) return null;
    if (type === 'moov') {
      if (size > 16 * 1024 * 1024) return null;
      const moov = await r.read(offset + header, size - header);
      return moovFacts(moov);
    }
    offset += size;
  }
  return null;
}

function moovFacts(moov: Uint8Array): AudioFacts | null {
  let duration: number | null = null;
  for (let at = 0; at + 8 <= moov.length; ) {
    const size = u32be(moov, at);
    if (size < 8) break;
    if (ascii(moov, at + 4, 4) === 'mvhd') {
      const version = moov[at + 8];
      const body = at + 12;
      if (version === 1) {
        const timescale = u32be(moov, body + 16);
        const d = u32be(moov, body + 20) * 2 ** 32 + u32be(moov, body + 24);
        duration = timescale ? d / timescale : null;
      } else {
        const timescale = u32be(moov, body + 8);
        duration = timescale ? u32be(moov, body + 12) / timescale : null;
      }
      break;
    }
    at += size;
  }
  if (duration === null) return null;
  let sound = false;
  for (let i = 0; i + 16 <= moov.length; i += 1) {
    if (moov[i] === 0x68 && ascii(moov, i, 4) === 'hdlr') {
      const handler = ascii(moov, i + 12, 4);
      if (handler === 'vide') return null;
      if (handler === 'soun') sound = true;
    }
  }
  return sound ? { mime: 'audio/mp4', durationSeconds: duration } : null;
}

// ---------------------------------------------------------------- MP3
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

type Frame = { length: number; bitrate: number; sampleRate: number; samples: number; version: number; mono: boolean };

/** An MPEG audio Layer III frame header at `at`, or null. */
function frame(b: Uint8Array, at: number): Frame | null {
  if (at + 4 > b.length || b[at] !== 0xff || (b[at + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[at + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (b[at + 1] >> 1) & 3; // 1 = Layer III
  const bitrateIndex = b[at + 2] >> 4;
  const rateIndex = (b[at + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex] * 1000;
  const sampleRate = RATES[version][rateIndex];
  const padding = (b[at + 2] >> 1) & 1;
  const samples = version === 3 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding;
  return { length, bitrate, sampleRate, samples, version, mono: b[at + 3] >> 6 === 3 };
}

async function mp3(r: Reader, head: Uint8Array): Promise<AudioFacts | null> {
  let start = 0;
  if (ascii(head, 0, 3) === 'ID3') {
    const tag = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    start = 10 + tag + (head[5] & 0x10 ? 10 : 0);
  }
  if (start >= r.size) return null;
  const b = await r.read(start, Math.min(r.size - start, 64 * 1024));
  // The first frame within 4 KB whose next frame also lines up (two in a row, not a stray 0xFF).
  for (let at = 0; at < Math.min(b.length, 4096); at += 1) {
    const f = frame(b, at);
    if (!f || !frame(b, at + f.length)) continue;
    const side = f.version === 3 ? (f.mono ? 17 : 32) : f.mono ? 9 : 17;
    const tagAt = at + 4 + side;
    const tag = ascii(b, tagAt, 4);
    if ((tag === 'Xing' || tag === 'Info') && u32be(b, tagAt + 4) & 1) {
      const frames = u32be(b, tagAt + 8);
      if (frames > 0) return { mime: 'audio/mpeg', durationSeconds: (frames * f.samples) / f.sampleRate };
    }
    if (ascii(b, at + 36, 4) === 'VBRI') {
      const frames = u32be(b, at + 36 + 14);
      if (frames > 0) return { mime: 'audio/mpeg', durationSeconds: (frames * f.samples) / f.sampleRate };
    }
    // Constant bit rate: the audio bytes divided by the byte rate.
    return { mime: 'audio/mpeg', durationSeconds: ((r.size - start - at) * 8) / f.bitrate };
  }
  return null;
}

/** File extensions allowed for each detected audio type (the name must match the content). */
export const AUDIO_EXTENSIONS: Record<AudioMime, string[]> = {
  'audio/mpeg': ['mp3'],
  'audio/mp4': ['m4a', 'mp4'],
  'audio/wav': ['wav'],
};

/** ADR-006 peaks: exactly 128 finite numbers from 0 to 1, or null. */
export function cleanPeaks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 128) return null;
  const peaks = value.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN));
  if (peaks.some((v) => Number.isNaN(v) || v < 0 || v > 1)) return null;
  return peaks.map((v) => Math.round(v * 1000) / 1000);
}
