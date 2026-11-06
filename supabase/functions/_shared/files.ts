// File rules for the D18 upload pipeline. Phase 4 accepts profile images, Phase 5 course covers;
// later phases add the other resource types here. Limits come from system_settings.file_limits (D17).

export type ResourceType = 'PROFILE_IMAGE' | 'COURSE_COVER';

const IMAGE_TYPES = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };

export const RESOURCES: Record<ResourceType, { bucket: string; limitKey: string; types: Record<string, string[]> }> = {
  PROFILE_IMAGE: {
    bucket: 'profile-images',
    limitKey: 'profile_image',
    // detected MIME type -> allowed extensions
    types: IMAGE_TYPES,
  },
  COURSE_COVER: {
    bucket: 'course-covers',
    limitKey: 'course_cover',
    types: IMAGE_TYPES,
  },
};

/** The real type from the first bytes (magic numbers), never from the name or the browser. */
export function sniffImage(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** A filename safe for Content-Disposition: letters, digits, dot, dash, underscore, space. */
export function safeName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || 'file';
}

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
}
