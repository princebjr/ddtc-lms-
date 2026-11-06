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
