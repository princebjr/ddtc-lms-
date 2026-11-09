// Synthetic media for tests: tiny but well-formed WAV, MP3, M4A and ZIP (DOCX, PPTX) files, so the
// server checks can be exercised without real recordings. Used by unit and Edge Function tests.

/** @param {...(number[] | Uint8Array | string)} parts */
export function concat(...parts) {
  const arrays = parts.map((p) => (typeof p === 'string' ? new TextEncoder().encode(p) : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}
const u16le = (/** @type {number} */ v) => [v & 255, (v >> 8) & 255];
const u32le = (/** @type {number} */ v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const u32be = (/** @type {number} */ v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];

/** PCM WAV: 8 kHz, mono, 16-bit (16 000 bytes per second). @param {number} seconds */
export function wav(seconds) {
  const data = new Uint8Array(seconds * 16000);
  return concat('RIFF', u32le(36 + data.length), 'WAVE', 'fmt ', u32le(16), u16le(1), u16le(1), u32le(8000), u32le(16000), u16le(2), u16le(16), 'data', u32le(data.length), data);
}

/** MPEG-1 Layer III, 128 kbit/s, 44.1 kHz frames (417 bytes each), after an ID3 tag. */
export function mp3({ frames = 100, xingFrames = 0 } = {}) {
  const frame = () => {
    const f = new Uint8Array(417);
    f.set([0xff, 0xfb, 0x90, 0x00]);
    return f;
  };
  const first = frame();
  if (xingFrames) first.set([...new TextEncoder().encode('Xing'), ...u32be(1), ...u32be(xingFrames)], 4 + 32);
  const id3 = concat('ID3', [4, 0, 0, 0, 0, 0, 20], new Uint8Array(20));
  return concat(id3, first, ...Array.from({ length: frames - 1 }, frame));
}

/** @param {string} type @param {Uint8Array | number[]} body */
const box = (type, body) => concat(u32be(8 + body.length), type, body);

/** M4A with the moov box after the media data. @param {{ seconds: number, handler?: string }} o */
export function m4a({ seconds, handler = 'soun' }) {
  const mvhdBody = new Uint8Array(100);
  mvhdBody.set(u32be(1000), 12); // timescale (version 0: after version/flags, creation, modification)
  mvhdBody.set(u32be(seconds * 1000), 16); // duration
  const hdlr = box('hdlr', concat([0, 0, 0, 0], [0, 0, 0, 0], handler, new Uint8Array(13)));
  const moov = box('moov', concat(box('mvhd', mvhdBody), box('trak', box('mdia', hdlr))));
  return concat(box('ftyp', concat('M4A ', [0, 0, 0, 0])), box('mdat', new Uint8Array(2000)), moov);
}

/** A ZIP holding these file names (empty files): enough for the central-directory check. @param {string[]} names */
export function zip(names) {
  const encoded = names.map((n) => new TextEncoder().encode(n));
  const local = concat(u32le(0x04034b50), new Uint8Array(26));
  const central = concat(...encoded.map((n) => concat(u32le(0x02014b50), new Uint8Array(24), u16le(n.length), u16le(0), u16le(0), new Uint8Array(12), n)));
  const eocd = concat(u32le(0x06054b50), new Uint8Array(6), u16le(names.length), u32le(central.length), u32le(local.length), u16le(0));
  return concat(local, central, eocd);
}

/** A minimal PDF. */
export const pdf = () => concat('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

// ---------------------------------------------------------------- browser recordings (Phase 8)
const u64le = (/** @type {number} */ v) => [...u32le(v % 2 ** 32), ...u32le(Math.floor(v / 2 ** 32))];
/** @param {number} v */
const uintBytes = (v) => {
  const out = [];
  do {
    out.unshift(v & 255);
    v = Math.floor(v / 256);
  } while (v > 0);
  return out;
};
/** @param {number} n */
const ebmlSize = (n) => (n < 0x7f ? [0x80 | n] : n < 0x3fff ? [0x40 | (n >> 8), n & 255] : [0x10 | (n >>> 24), (n >> 16) & 255, (n >> 8) & 255, n & 255]);
/** @param {number} id @param {Uint8Array | number[] | string} body */
const el = (id, body) => {
  const b = typeof body === 'string' ? new TextEncoder().encode(body) : Uint8Array.from(body);
  return concat(uintBytes(id), ebmlSize(b.length), b);
};
/** An element of unknown size, as a live recorder writes it. @param {number} id @param {Uint8Array} body */
const liveEl = (id, body) => concat(uintBytes(id), [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], body);
/** @param {number} v */
const f64 = (v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return b;
};

/**
 * WebM as Chrome's MediaRecorder writes it: no Duration (unless asked), segment and clusters of
 * unknown size, a cluster every 5 s and a block every second, the last block exactly at `seconds`.
 * `fakeCluster` hides a cluster id inside the last block's data, as real audio can.
 * @param {{ seconds: number, withDuration?: boolean, video?: boolean, docType?: string, fakeCluster?: boolean }} o
 */
export function webm({ seconds, withDuration = false, video = false, docType = 'webm', fakeCluster = false }) {
  const header = el(0x1a45dfa3, concat(el(0x4286, [1]), el(0x42f7, [1]), el(0x42f2, [4]), el(0x42f3, [8]), el(0x4282, docType), el(0x4287, [4]), el(0x4285, [2])));
  const info = el(0x1549a966, concat(el(0x2ad7b1, uintBytes(1000000)), withDuration ? el(0x4489, f64(seconds * 1000)) : []));
  const audio = el(0xae, concat(el(0xd7, [1]), el(0x83, [2]), el(0x86, 'A_OPUS')));
  const tracks = el(0x1654ae6b, concat(audio, video ? el(0xae, concat(el(0xd7, [2]), el(0x83, [1]), el(0x86, 'V_VP8'))) : []));
  const total = seconds * 1000;
  const clusters = [];
  for (let tc = 0; tc <= total; tc += 5000) {
    const blocks = [];
    for (let rel = 0; rel < 5000 && tc + rel <= total; rel += 1000) {
      const last = tc + rel + 1000 > total;
      const data = last && fakeCluster ? concat([0x1f, 0x43, 0xb6, 0x75, 0x84, 0xa3, 0x81, 0x00, 0x00], new Uint8Array(31)) : new Uint8Array(40);
      blocks.push(el(0xa3, concat([0x81], [(rel >> 8) & 255, rel & 255], [0x80], data)));
    }
    clusters.push(liveEl(0x1f43b675, concat(el(0xe7, uintBytes(tc)), ...blocks)));
  }
  return concat(header, liveEl(0x18538067, concat(info, tracks, ...clusters)));
}

/**
 * Ogg as Firefox records it (Opus), or Vorbis: one page per second, the last page's granule
 * position giving the length. `video` adds a Theora stream.
 * @param {{ seconds: number, codec?: 'opus' | 'vorbis', video?: boolean }} o
 */
export function ogg({ seconds, codec = 'opus', video = false }) {
  /** @param {{ type?: number, granule: number, serial?: number, seq: number, data: Uint8Array }} p */
  const page = ({ type = 0, granule, serial = 0x1234, seq, data }) => {
    const segs = [];
    let n = data.length;
    while (n >= 255) {
      segs.push(255);
      n -= 255;
    }
    segs.push(n);
    return concat('OggS', [0, type], u64le(granule), u32le(serial), u32le(seq), u32le(0), [segs.length], segs, data);
  };
  const opus = codec === 'opus';
  const rate = opus ? 48000 : 44100;
  const preSkip = opus ? 312 : 0;
  const ident = opus
    ? concat('OpusHead', [1, 1], u16le(preSkip), u32le(48000), [0, 0], [0])
    : concat([1], 'vorbis', u32le(0), [1], u32le(rate), u32le(0), u32le(128000), u32le(0), [0xb8], [1]);
  const pages = [page({ type: 2, granule: 0, seq: 0, data: ident })];
  if (video) pages.push(page({ type: 2, granule: 0, serial: 0x5678, seq: 0, data: concat([0x80], 'theora', new Uint8Array(30)) }));
  pages.push(page({ granule: 0, seq: 1, data: concat(opus ? 'OpusTags' : concat([3], 'vorbis'), new Uint8Array(20)) }));
  for (let s = 1; s <= seconds; s += 1) pages.push(page({ type: s === seconds ? 4 : 0, granule: s * rate + preSkip, seq: s + 1, data: new Uint8Array(100) }));
  return concat(...pages);
}

/** @param {string} type @param {number} version @param {number} flags @param {Uint8Array | number[]} body */
const fullBox = (type, version, flags, body) => box(type, concat([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], body));

/**
 * Fragmented MP4 (AAC, 48 kHz) as Safari's MediaRecorder writes it: mvhd and mdhd durations of 0,
 * the length only in the fragments (2 s each, frames of 1024 samples). `mehd` adds the movie-extends
 * header; `tfdt: false` drops each fragment's start time; `perSample: false` uses a default sample
 * duration in tfhd.
 * @param {{ seconds: number, mehd?: boolean, tfdt?: boolean, perSample?: boolean }} o
 */
export function fmp4({ seconds, mehd = false, tfdt = true, perSample = true }) {
  const mvhd = fullBox('mvhd', 0, 0, concat(u32be(0), u32be(0), u32be(1000), u32be(0), new Uint8Array(80)));
  const mdhd = fullBox('mdhd', 0, 0, concat(u32be(0), u32be(0), u32be(48000), u32be(0), [0x55, 0xc4, 0, 0]));
  const hdlr = box('hdlr', concat([0, 0, 0, 0], [0, 0, 0, 0], 'soun', new Uint8Array(13)));
  const trex = fullBox('trex', 0, 0, concat(u32be(1), u32be(1), u32be(1024), u32be(0), u32be(0)));
  const mvex = box('mvex', concat(mehd ? fullBox('mehd', 0, 0, u32be(seconds * 1000)) : [], trex));
  const moov = box('moov', concat(mvhd, box('trak', box('mdia', concat(mdhd, hdlr))), mvex));
  const frags = [];
  const end = seconds * 48000;
  for (let t = 0, seq = 1; t < end; t += 96000, seq += 1) {
    const span = Math.min(96000, end - t);
    const durations = [];
    for (let left = span; left > 0; left -= 1024) durations.push(Math.min(1024, left));
    const tfhd = fullBox('tfhd', 0, perSample ? 0x020000 : 0x020008, concat(u32be(1), perSample ? [] : u32be(1024)));
    const tfdtBox = tfdt ? fullBox('tfdt', 1, 0, concat(u32be(Math.floor(t / 2 ** 32)), u32be(t % 2 ** 32))) : new Uint8Array(0);
    const trun = fullBox('trun', 0, perSample ? 0x000101 : 0x000001, concat(u32be(durations.length), u32be(0), perSample ? concat(...durations.map(u32be)) : []));
    frags.push(box('moof', concat(fullBox('mfhd', 0, 0, u32be(seq)), box('traf', concat(tfhd, tfdtBox, trun)))), box('mdat', new Uint8Array(100)));
  }
  return concat(box('ftyp', concat('iso5', [0, 0, 0, 1], 'iso5', 'mp41')), moov, ...frags);
}
