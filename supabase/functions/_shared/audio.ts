// Audio checks for the D18 pipeline (finalize-upload): the real type from the bytes, never the name
// or the browser, and the duration from the file's own header. Only small ranges are read, so a
// 90-minute, 100 MB lesson stays within an Edge Function's memory and CPU limits.
// Pure code with no imports: unit-tested in tests/unit/audio-inspect.test.js.

export type Reader = { size: number; read(offset: number, length: number): Promise<Uint8Array> };
export type AudioMime = 'audio/mpeg' | 'audio/mp4' | 'audio/wav' | 'audio/webm' | 'audio/ogg';
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
const u64be = (b: Uint8Array, at: number) => u32be(b, at) * 2 ** 32 + u32be(b, at + 4);

/** The file's real audio type and duration, or null when it is not a supported audio file. */
export async function inspectAudio(r: Reader): Promise<AudioFacts | null> {
  if (r.size < 12) return null;
  const head = await r.read(0, Math.min(r.size, 64 * 1024));
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') return wav(r);
  if (ascii(head, 4, 4) === 'ftyp') return mp4(r);
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return webm(r, head);
  if (ascii(head, 0, 4) === 'OggS') return ogg(r, head);
  if (KNOWN_OTHER.some((sig) => sig.every((v, i) => head[i] === v))) return null;
  return mp3(r, head);
}

/** The last `bytes` of the file (at most the whole file). */
const tail = (r: Reader, bytes: number) => r.read(Math.max(0, r.size - bytes), Math.min(r.size, bytes));

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
// track and no video track (a renamed video is not lesson audio). A fragmented MP4 (Safari's
// recorder, Phase 8) states a duration of 0 there: its length comes from the movie-extends header
// (`mehd`) when there is one, otherwise from the last fragment's start time (`tfdt`) plus its
// samples, or, when fragments carry no start time, from adding up every fragment.
async function mp4(r: Reader): Promise<AudioFacts | null> {
  let offset = 0;
  for (let i = 0; i < 64 && offset + 8 <= r.size; i += 1) {
    const h = await r.read(offset, 16);
    let size = u32be(h, 0);
    const type = ascii(h, 4, 4);
    let header = 8;
    if (size === 1) {
      size = u64be(h, 8);
      header = 16;
    } else if (size === 0) {
      size = r.size - offset;
    }
    if (size < header) return null;
    if (type === 'moov') {
      if (size > 16 * 1024 * 1024) return null;
      const facts = moovFacts(await r.read(offset + header, size - header));
      if (!facts) return null;
      if (facts.seconds > 0) return { mime: 'audio/mp4', durationSeconds: facts.seconds };
      if (facts.mehdSeconds > 0) return { mime: 'audio/mp4', durationSeconds: facts.mehdSeconds };
      if (!facts.trackTimescale) return null;
      const ticks = (await lastFragmentEnd(r, facts.defaultSampleDuration)) ?? (await allFragmentTicks(r, offset + size, facts.defaultSampleDuration));
      return ticks ? { mime: 'audio/mp4', durationSeconds: ticks / facts.trackTimescale } : null;
    }
    offset += size;
  }
  return null;
}

type MoovFacts = { seconds: number; mehdSeconds: number; trackTimescale: number; defaultSampleDuration: number };

/** The offset of a box of this type anywhere in `b` (a byte scan, as for hdlr), or -1. */
function findBox(b: Uint8Array, type: string): number {
  const first = type.charCodeAt(0);
  for (let i = 4; i + 4 <= b.length; i += 1) if (b[i] === first && ascii(b, i, 4) === type) return i - 4;
  return -1;
}

function moovFacts(moov: Uint8Array): MoovFacts | null {
  let duration: number | null = null;
  let movieTimescale = 0;
  for (let at = 0; at + 8 <= moov.length; ) {
    const size = u32be(moov, at);
    if (size < 8) break;
    if (ascii(moov, at + 4, 4) === 'mvhd') {
      const version = moov[at + 8];
      const body = at + 12;
      if (version === 1) {
        movieTimescale = u32be(moov, body + 16);
        const d = u64be(moov, body + 20);
        duration = movieTimescale ? (d === 2 ** 64 - 1 ? 0 : d / movieTimescale) : null;
      } else {
        movieTimescale = u32be(moov, body + 8);
        const d = u32be(moov, body + 12);
        duration = movieTimescale ? (d === 0xffffffff ? 0 : d / movieTimescale) : null;
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
  if (!sound) return null;
  const mehd = findBox(moov, 'mehd');
  const mehdTicks = mehd < 0 ? 0 : moov[mehd + 8] === 1 ? u64be(moov, mehd + 12) : u32be(moov, mehd + 12);
  const mdhd = findBox(moov, 'mdhd');
  const trex = findBox(moov, 'trex');
  return {
    seconds: duration,
    mehdSeconds: movieTimescale ? mehdTicks / movieTimescale : 0,
    trackTimescale: mdhd < 0 ? 0 : moov[mdhd + 8] === 1 ? u32be(moov, mdhd + 28) : u32be(moov, mdhd + 20),
    defaultSampleDuration: trex < 0 ? 0 : u32be(moov, trex + 20),
  };
}

/**
 * A movie fragment (`moof` from `start` to `end` in `b`): its start time (`tfdt`, null when absent)
 * and the summed duration of its samples, in track ticks; null when the bytes are not a fragment.
 */
function fragmentTiming(b: Uint8Array, start: number, end: number, trexDefault: number): { base: number | null; duration: number } | null {
  let base: number | null = null;
  let duration = 0;
  let found = false;
  for (let at = start + 8; at + 8 <= end; ) {
    const size = u32be(b, at);
    if (size < 8 || at + size > end) return null;
    if (ascii(b, at + 4, 4) === 'traf') {
      let fallback = trexDefault;
      let trafBase: number | null = null;
      let trafDuration = 0;
      for (let t = at + 8; t + 8 <= at + size; ) {
        const s = u32be(b, t);
        if (s < 12 || t + s > at + size) return null;
        const type = ascii(b, t + 4, 4);
        const flags = (b[t + 9] << 16) | (b[t + 10] << 8) | b[t + 11];
        if (type === 'tfhd') {
          let p = t + 16; // after version, flags and track id
          if (flags & 0x01) p += 8; // base data offset
          if (flags & 0x02) p += 4; // sample description index
          if (flags & 0x08) fallback = u32be(b, p);
        } else if (type === 'tfdt') {
          trafBase = b[t + 8] === 1 ? u64be(b, t + 12) : u32be(b, t + 12);
        } else if (type === 'trun') {
          const count = u32be(b, t + 12);
          let p = t + 16;
          if (flags & 0x01) p += 4; // data offset
          if (flags & 0x04) p += 4; // first sample flags
          if (flags & 0x100) {
            const stride = 4 * (1 + (flags & 0x200 ? 1 : 0) + (flags & 0x400 ? 1 : 0) + (flags & 0x800 ? 1 : 0));
            if (p + count * stride > t + s) return null;
            for (let k = 0; k < count; k += 1) trafDuration += u32be(b, p + k * stride);
          } else {
            trafDuration += count * fallback;
          }
        }
        t += s;
      }
      found = true;
      if (trafBase !== null) base = base === null ? trafBase : Math.max(base, trafBase);
      duration = Math.max(duration, trafDuration);
    }
    at += size;
  }
  return found ? { base, duration } : null;
}

/** The end of the last fragment (its start time plus its samples) from the file's last 512 KB, or null. */
async function lastFragmentEnd(r: Reader, trexDefault: number): Promise<number | null> {
  const b = await tail(r, 512 * 1024);
  for (let q = b.length - 12; q >= 4; q -= 1) {
    if (b[q] !== 0x6d || ascii(b, q, 4) !== 'moof' || ascii(b, q + 8, 4) !== 'mfhd') continue;
    const start = q - 4;
    const size = u32be(b, start);
    if (size < 16 || start + size > b.length) continue;
    const timing = fragmentTiming(b, start, start + size, trexDefault);
    if (timing) return timing.base === null ? null : timing.base + timing.duration;
  }
  return null;
}

/** Adds up every fragment after `from` (fragments without start times), reading 1 MB blocks. */
async function allFragmentTicks(r: Reader, from: number, trexDefault: number): Promise<number | null> {
  const block = 1024 * 1024;
  let cached: { index: number; bytes: Uint8Array } | null = null;
  const read = async (offset: number, length: number): Promise<Uint8Array | null> => {
    const out = new Uint8Array(length);
    for (let done = 0; done < length; ) {
      const index = Math.floor((offset + done) / block);
      if (!cached || cached.index !== index) cached = { index, bytes: await r.read(index * block, Math.min(block, r.size - index * block)) };
      const at = offset + done - index * block;
      const n = Math.min(length - done, cached.bytes.length - at);
      if (n <= 0) return null;
      out.set(cached.bytes.subarray(at, at + n), done);
      done += n;
    }
    return out;
  };
  let total = 0;
  let found = false;
  for (let offset = from, i = 0; offset + 8 <= r.size && i < 20000; i += 1) {
    const h = await read(offset, Math.min(16, r.size - offset));
    if (!h) return null;
    let size = u32be(h, 0);
    let header = 8;
    if (size === 1 && h.length >= 16) {
      size = u64be(h, 8);
      header = 16;
    } else if (size === 0) {
      size = r.size - offset;
    }
    if (size < header) return null;
    if (ascii(h, 4, 4) === 'moof') {
      if (size > 4 * 1024 * 1024) return null;
      const moof = await read(offset, size);
      const timing = moof && fragmentTiming(moof, 0, size, trexDefault);
      if (!timing) return null;
      total += timing.duration;
      found = true;
    }
    offset += size;
  }
  return found ? total : null;
}

// ---------------------------------------------------------------- WebM (Chrome, Android)
// EBML with DocType "webm", one audio track and no video track. MediaRecorder writes no Duration
// and leaves the segment and clusters open-ended, so without a Duration the length is the last
// cluster's timecode plus its latest block's, found in the file's last 2 MB.
const EBML = {
  header: 0x1a45dfa3, docType: 0x4282, segment: 0x18538067, info: 0x1549a966, timecodeScale: 0x2ad7b1, duration: 0x4489,
  tracks: 0x1654ae6b, trackEntry: 0xae, trackType: 0x83, cluster: 0x1f43b675, timecode: 0xe7, simpleBlock: 0xa3,
  blockGroup: 0xa0, block: 0xa1,
};
/** Elements a cluster may hold; anything else ends the cluster (the next top-level element). */
const CLUSTER_CHILDREN = new Set([0xe7, 0xa3, 0xa0, 0xa7, 0xab, 0x5854, 0xaf, 0xec, 0xbf]);

/** An EBML id (marker bits kept) at `at`, or null. */
function ebmlId(b: Uint8Array, at: number): { id: number; len: number } | null {
  const first = b[at];
  if (first === undefined) return null;
  let len = 1;
  for (let mask = 0x80; len <= 4 && !(first & mask); mask >>= 1) len += 1;
  if (len > 4 || at + len > b.length) return null;
  let id = 0;
  for (let i = 0; i < len; i += 1) id = id * 256 + b[at + i];
  return { id, len };
}

/** An EBML size at `at`: its value (null when unknown) and length, or null. */
function ebmlSize(b: Uint8Array, at: number): { value: number | null; len: number } | null {
  const first = b[at];
  if (first === undefined) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    mask >>= 1;
    len += 1;
  }
  if (len > 8 || at + len > b.length) return null;
  let value = first & (mask - 1);
  let unknown = value === mask - 1;
  for (let i = 1; i < len; i += 1) {
    value = value * 256 + b[at + i];
    if (b[at + i] !== 0xff) unknown = false;
  }
  return { value: unknown ? null : value, len };
}

const uintAt = (b: Uint8Array, at: number, n: number) => {
  let v = 0;
  for (let i = 0; i < n; i += 1) v = v * 256 + b[at + i];
  return v;
};

/** The elements directly inside [from, to) of `b`, each with its id and body range. */
function* ebmlChildren(b: Uint8Array, from: number, to: number) {
  for (let at = from; at < to; ) {
    const e = ebmlId(b, at);
    const s = e && ebmlSize(b, at + e.len);
    if (!e || !s || s.value === null) return;
    const body = at + e.len + s.len;
    if (body + s.value > to) return;
    yield { id: e.id, body, end: body + s.value };
    at = body + s.value;
  }
}

async function webm(r: Reader, first: Uint8Array): Promise<AudioFacts | null> {
  let b = first;
  const h = ebmlId(b, 0);
  const hs = h && ebmlSize(b, h.len);
  if (!h || !hs || hs.value === null || h.id !== EBML.header) return null;
  const headerEnd = h.len + hs.len + hs.value;
  let docType = '';
  for (const c of ebmlChildren(b, h.len + hs.len, headerEnd)) if (c.id === EBML.docType) docType = ascii(b, c.body, c.end - c.body);
  if (docType !== 'webm') return null;
  const seg = ebmlId(b, headerEnd);
  const ss = seg && ebmlSize(b, headerEnd + seg.len);
  if (!seg || !ss || seg.id !== EBML.segment) return null;

  // The segment's first children, up to the first cluster: Info (scale, maybe Duration) and Tracks.
  let scale = 1_000_000;
  let duration = 0;
  let audio = false;
  for (let at = headerEnd + seg.len + ss.len, i = 0; i < 64; i += 1) {
    if (at + 12 > b.length) {
      if (b.length >= r.size || b.length >= 2 * 1024 * 1024) break;
      b = await r.read(0, Math.min(r.size, b.length * 2));
      continue;
    }
    const e = ebmlId(b, at);
    const s = e && ebmlSize(b, at + e.len);
    if (!e || !s) return null;
    if (e.id === EBML.cluster) break;
    if (s.value === null) return null;
    const body = at + e.len + s.len;
    const end = body + s.value;
    if ((e.id === EBML.info || e.id === EBML.tracks) && end > b.length) {
      if (end > 2 * 1024 * 1024 || end > r.size) return null;
      b = await r.read(0, end);
    }
    if (e.id === EBML.info) {
      for (const c of ebmlChildren(b, body, end)) {
        if (c.id === EBML.timecodeScale) scale = uintAt(b, c.body, c.end - c.body) || scale;
        if (c.id === EBML.duration && (c.end - c.body === 4 || c.end - c.body === 8)) {
          const view = new DataView(b.buffer, b.byteOffset + c.body, c.end - c.body);
          duration = c.end - c.body === 4 ? view.getFloat32(0) : view.getFloat64(0);
        }
      }
    } else if (e.id === EBML.tracks) {
      for (const entry of ebmlChildren(b, body, end)) {
        if (entry.id !== EBML.trackEntry) continue;
        for (const c of ebmlChildren(b, entry.body, entry.end)) {
          if (c.id !== EBML.trackType) continue;
          const kind = uintAt(b, c.body, c.end - c.body);
          if (kind === 1) return null; // video
          if (kind === 2) audio = true;
        }
      }
    }
    at = end;
  }
  if (!audio) return null;
  if (Number.isFinite(duration) && duration > 0) return { mime: 'audio/webm', durationSeconds: (duration * scale) / 1e9 };
  const last = await lastWebmTime(r);
  return last === null ? null : { mime: 'audio/webm', durationSeconds: (last * scale) / 1e9 };
}

/** The latest block time in the file's last cluster (in timecode units), from its last 2 MB. */
async function lastWebmTime(r: Reader): Promise<number | null> {
  const b = await tail(r, 2 * 1024 * 1024);
  for (let p = b.length - 4; p >= 0; p -= 1) {
    if (b[p] !== 0x1f || b[p + 1] !== 0x43 || b[p + 2] !== 0xb6 || b[p + 3] !== 0x75) continue;
    const t = clusterEnd(b, p);
    if (t !== null) return t;
  }
  return null;
}

/**
 * The cluster starting at `p`: its timecode plus its latest block's relative time, or null when the
 * bytes there are not a cluster (its first child must be the Timecode, as the format requires).
 */
function clusterEnd(b: Uint8Array, p: number): number | null {
  const s = ebmlSize(b, p + 4);
  if (!s) return null;
  let at = p + 4 + s.len;
  const end = s.value === null ? b.length : Math.min(b.length, at + s.value);
  let timecode: number | null = null;
  let latest = 0;
  while (at < end) {
    const e = ebmlId(b, at);
    const es = e && ebmlSize(b, at + e.len);
    if (!e || !es || es.value === null) break;
    if (timecode === null && e.id !== EBML.timecode) return null;
    if (!CLUSTER_CHILDREN.has(e.id)) break;
    const bodyAt = at + e.len + es.len;
    if (bodyAt + es.value > b.length) break; // runs past the end of the file
    if (e.id === EBML.timecode) {
      if (es.value < 1 || es.value > 8) return null;
      timecode = uintAt(b, bodyAt, es.value);
    } else if (e.id === EBML.simpleBlock || e.id === EBML.blockGroup) {
      let blockAt: number | null = bodyAt;
      if (e.id === EBML.blockGroup) {
        blockAt = null;
        for (const c of ebmlChildren(b, bodyAt, bodyAt + es.value)) if (c.id === EBML.block) blockAt = c.body;
      }
      const track = blockAt === null ? null : ebmlSize(b, blockAt);
      if (blockAt === null || !track || track.value === null) return null;
      const raw = (b[blockAt + track.len] << 8) | b[blockAt + track.len + 1];
      const rel = raw & 0x8000 ? raw - 0x10000 : raw;
      if (rel > latest) latest = rel;
    }
    at = bodyAt + es.value;
  }
  return timecode === null ? null : timecode + latest;
}

// ---------------------------------------------------------------- Ogg (Firefox)
// Opus or Vorbis, with no video stream among the opening pages. The length is the last page's
// granule position for that stream (less Opus's pre-skip), found in the file's last 256 KB.
type OggPage = { type: number; granule: number | null; serial: number; dataAt: number; dataLen: number; end: number };

function oggPage(b: Uint8Array, at: number): OggPage | null {
  if (at + 27 > b.length || ascii(b, at, 4) !== 'OggS' || b[at + 4] !== 0) return null;
  const lo = u32le(b, at + 6);
  const hi = u32le(b, at + 10);
  const segments = b[at + 26];
  if (at + 27 + segments > b.length) return null;
  let dataLen = 0;
  for (let i = 0; i < segments; i += 1) dataLen += b[at + 27 + i];
  const dataAt = at + 27 + segments;
  return {
    type: b[at + 5],
    granule: lo === 0xffffffff && hi === 0xffffffff ? null : hi * 2 ** 32 + lo,
    serial: u32le(b, at + 14),
    dataAt,
    dataLen,
    end: dataAt + dataLen,
  };
}

async function ogg(r: Reader, head: Uint8Array): Promise<AudioFacts | null> {
  const first = oggPage(head, 0);
  if (!first || !(first.type & 0x02) || first.end > head.length) return null;
  const packet = head.subarray(first.dataAt, first.end);
  let rate = 0;
  let preSkip = 0;
  if (ascii(packet, 0, 8) === 'OpusHead') {
    rate = 48000;
    preSkip = packet[10] + (packet[11] << 8);
  } else if (packet[0] === 1 && ascii(packet, 1, 6) === 'vorbis') {
    rate = u32le(packet, 12);
  } else {
    return null;
  }
  if (!rate) return null;
  // Other streams start with their own first pages straight after: refuse any video among them.
  for (let at = first.end; at < head.length; ) {
    const page = oggPage(head, at);
    if (!page || !(page.type & 0x02)) break;
    const data = head.subarray(page.dataAt, Math.min(page.end, head.length));
    if (ascii(data, 1, 6) === 'theora' || ascii(data, 0, 8) === 'OVP80\u0001\u0001\u0000' || data[0] === 0x80) return null;
    at = page.end;
  }
  const b = await tail(r, 256 * 1024);
  for (let p = b.length - 27; p >= 0; p -= 1) {
    if (b[p] !== 0x4f) continue;
    const page = oggPage(b, p);
    if (!page || page.serial !== first.serial || page.granule === null) continue;
    const samples = page.granule - preSkip;
    return samples < 0 ? null : { mime: 'audio/ogg', durationSeconds: samples / rate };
  }
  return null;
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
  'audio/webm': ['webm', 'weba'],
  'audio/ogg': ['ogg', 'oga', 'opus'],
};

/** ADR-006 peaks: exactly 128 finite numbers from 0 to 1, or null. */
export function cleanPeaks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 128) return null;
  const peaks = value.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN));
  if (peaks.some((v) => Number.isNaN(v) || v < 0 || v > 1)) return null;
  return peaks.map((v) => Math.round(v * 1000) / 1000);
}
