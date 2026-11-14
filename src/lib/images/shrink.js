// Pictures are made smaller in the browser before they are uploaded (Phase 15, ADR-028: no paid image
// transformation). A phone photo of several MB becomes about 20–40 KB for a profile picture and 150–300 KB for a
// course cover, so it uploads quickly, fits the free plan's storage, and costs far less to show (5 GB of downloads a
// month). WebP where the browser can write it (Chrome, Edge, Firefox, Android); JPEG otherwise (Safari). The file's
// name follows its new format: the server refuses a file whose name and contents disagree. If the browser cannot
// shrink it, or the result is not smaller, the original file is used unchanged.

/** Longest side, in CSS pixels at up to 2x density. */
export const IMAGE_SIZES = Object.freeze({ PROFILE_IMAGE: 320, COURSE_COVER: 1600 });
const QUALITY = 0.82;

/**
 * The new width and height so the longer side is at most `max`, keeping the shape (never enlarged).
 * @param {number} width @param {number} height @param {number} max
 */
export function fitWithin(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The file name with the extension of its new type. @param {string} name @param {string} type */
export function renameFor(name, type) {
  const ext = type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg' : 'png';
  const base = name.replace(/\.[^./\\]*$/, '') || 'image';
  return `${base}.${ext}`;
}

/**
 * Whether the file's first bytes are a JPEG, PNG or WebP picture of the type it claims. A file that claims to be
 * a picture but is something else is uploaded unchanged, so the server refuses it (D18) instead of the browser
 * quietly turning it into a real picture.
 * @param {File} file
 */
export async function isGenuineImage(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (/** @type {number} */ from, /** @type {number} */ to) => String.fromCharCode(...b.slice(from, to));
  if (file.type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (file.type === 'image/png') return b[0] === 0x89 && ascii(1, 4) === 'PNG';
  if (file.type === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return false;
}

/**
 * A smaller copy of the picture, or the original when shrinking is not possible or would not help.
 * @param {File} file @param {number} max  the longest side in pixels
 * @returns {Promise<File>}
 */
export async function shrinkImage(file, max) {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    if (!(await isGenuineImage(file))) return file;
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    /** @param {string} type */
    const encode = (type) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, QUALITY));
    let blob = /** @type {Blob | null} */ (await encode('image/webp'));
    // Safari writes PNG when asked for WebP: use JPEG there instead (much smaller for photos).
    if (!blob || blob.type !== 'image/webp') blob = /** @type {Blob | null} */ (await encode('image/jpeg'));
    if (!blob || blob.size >= file.size || !blob.type.startsWith('image/')) return file;
    return new File([blob], renameFor(file.name, blob.type), { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}
