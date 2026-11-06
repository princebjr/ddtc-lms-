// Document checks for the D18 pipeline (finalize-upload): PDF, DOCX and PPTX by their real
// content. DOCX and PPTX are ZIP files; only the ZIP's central directory (its table of contents)
// is read, never the whole file. Files with macros are refused. Pure code with no imports:
// unit-tested in tests/unit/document-inspect.test.js.

import type { Reader } from './audio.ts';

export type DocumentMime =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export const DOCUMENT_EXTENSIONS: Record<DocumentMime, string[]> = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
};

const u16le = (b: Uint8Array, at: number) => b[at] + (b[at + 1] << 8);
const u32le = (b: Uint8Array, at: number) => b[at] + (b[at + 1] << 8) + (b[at + 2] << 16) + ((b[at + 3] << 24) >>> 0);

/** The document's real type, or null when it is not a supported, macro-free document. */
export async function inspectDocument(r: Reader): Promise<DocumentMime | null> {
  if (r.size < 22) return null;
  const head = await r.read(0, Math.min(r.size, 1024));
  // %PDF- within the first 1 KB (some writers put a few bytes before it).
  const text = String.fromCharCode(...head);
  if (text.includes('%PDF-')) return 'application/pdf';
  if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) return null;

  const names = await zipNames(r);
  if (!names || !names.includes('[Content_Types].xml')) return null;
  if (names.some((n) => /vbaProject\.bin$/i.test(n))) return null;
  if (names.includes('word/document.xml')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (names.includes('ppt/presentation.xml')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return null;
}

/** The file names listed in a ZIP's central directory, or null when it cannot be read. */
async function zipNames(r: Reader): Promise<string[] | null> {
  // The end-of-central-directory record is in the last 22 bytes plus up to 64 KB of comment.
  const tailLength = Math.min(r.size, 22 + 65535);
  const tail = await r.read(r.size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = u16le(tail, eocd + 10);
  const cdSize = u32le(tail, eocd + 12);
  const cdOffset = u32le(tail, eocd + 16);
  if (cdOffset + cdSize > r.size || cdSize > 4 * 1024 * 1024 || entries > 20000) return null;
  const cd = await r.read(cdOffset, cdSize);
  const names: string[] = [];
  for (let at = 0, i = 0; i < entries && at + 46 <= cd.length; i += 1) {
    if (u32le(cd, at) !== 0x02014b50) return null;
    const nameLength = u16le(cd, at + 28);
    const extraLength = u16le(cd, at + 30);
    const commentLength = u16le(cd, at + 32);
    names.push(new TextDecoder().decode(cd.subarray(at + 46, at + 46 + nameLength)));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}
