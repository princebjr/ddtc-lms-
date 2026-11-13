// @vitest-environment jsdom
// Phase 15 (ADR-028): pictures are made smaller in the browser before upload. The shape is kept, a picture is
// never enlarged, the name follows the new format (the server refuses a name that disagrees with the contents),
// and when the browser cannot shrink it the original is used unchanged.
import { describe, expect, it } from 'vitest';
import { fitWithin, IMAGE_SIZES, isGenuineImage, renameFor, shrinkImage } from '@/lib/images/shrink.js';

describe('fitWithin', () => {
  it('scales the longer side down to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 320)).toEqual({ width: 240, height: 320 });
  });
  it('never enlarges a small picture', () => {
    expect(fitWithin(200, 100, 320)).toEqual({ width: 200, height: 100 });
  });
});

describe('renameFor', () => {
  it('gives the name the extension of its new format', () => {
    expect(renameFor('IMG_2041.HEIC.jpeg', 'image/webp')).toBe('IMG_2041.HEIC.webp');
    expect(renameFor('cover.png', 'image/jpeg')).toBe('cover.jpg');
    expect(renameFor('noextension', 'image/webp')).toBe('noextension.webp');
  });
});

describe('shrinkImage', () => {
  it('keeps the original when the browser cannot shrink it', async () => {
    const file = new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' });
    expect(await shrinkImage(file, IMAGE_SIZES.PROFILE_IMAGE)).toBe(file); // jsdom has no createImageBitmap
  });
  it('leaves anything that is not a picture alone', async () => {
    const file = new File(['%PDF-1.7'], 'notes.pdf', { type: 'application/pdf' });
    expect(await shrinkImage(file, 320)).toBe(file);
  });
  it('recognises a genuine picture by its first bytes, and a disguised file as not one', async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])], 'a.jpg', { type: 'image/jpeg' });
    const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'a.png', { type: 'image/png' });
    const webp = new File([new TextEncoder().encode('RIFF\0\0\0\0WEBP')], 'a.webp', { type: 'image/webp' });
    const disguised = new File(['<svg>not really a png</svg>'], 'fake.png', { type: 'image/png' });
    const wrongType = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])], 'jpeg-named.png', { type: 'image/png' });
    expect(await isGenuineImage(jpeg)).toBe(true);
    expect(await isGenuineImage(pngFile)).toBe(true);
    expect(await isGenuineImage(webp)).toBe(true);
    expect(await isGenuineImage(disguised)).toBe(false);
    expect(await isGenuineImage(wrongType)).toBe(false);
  });
  it('uses the agreed sizes: 320 px for profile pictures and 1600 px for covers', () => {
    expect(IMAGE_SIZES).toEqual({ PROFILE_IMAGE: 320, COURSE_COVER: 1600 });
  });
});
