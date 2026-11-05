#!/usr/bin/env node
// Generates small WebP copies of the supplied logos for the UI (same artwork, resized only;
// DESIGN.md 4 forbids altering logos). Run: node scripts/brand-derive.mjs
// The originals in assets/brand/ stay the source of truth; outputs go to src/assets/brand/derived/.
// The gölarae mask uses the solid white silhouette: LogoMark paints it navy on light, white on dark.
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'src/assets/brand/derived';
mkdirSync(OUT, { recursive: true });

/** @type {Array<[source: string, name: string, sizes: number[]]>} */
const JOBS = [
  ['assets/brand/logo-ddtc-white.png', 'logo-ddtc', [128, 384]],
  ['assets/brand/logo-golarae-white.png', 'logo-golarae', [128]],
];

for (const [source, name, sizes] of JOBS) {
  for (const size of sizes) {
    const file = `${OUT}/${name}-${size}.webp`;
    await sharp(source).resize(size, size, { fit: 'contain' }).webp({ quality: 90, alphaQuality: 100 }).toFile(file);
    console.log(`wrote ${file}`);
  }
}
