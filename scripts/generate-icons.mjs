#!/usr/bin/env node
/**
 * Rasterise the app icon and launch screen.
 *
 * Two rules from Apple drive the output, and both are rejection reasons rather
 * than suggestions:
 *
 *  - The App Store icon is 1024×1024, square, and has NO alpha channel. Apple
 *    applies the rounded mask itself; an icon that arrives pre-rounded on a
 *    transparent background gets rejected.
 *  - The launch screen has to cover every device aspect ratio, so it is
 *    generated square and oversized and cropped from the centre.
 *
 *   npm run icons
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKGROUND = { r: 0x0b, g: 0x11, b: 0x16, alpha: 1 };

/** [source, output, size, opaque] */
const TARGETS = [
  ['resources/icon.svg', 'resources/ios/AppIcon-1024.png', 1024, true],
  ['resources/icon.svg', 'public/apple-touch-icon.png', 180, true],
  ['resources/icon.svg', 'public/icon-192.png', 192, false],
  ['resources/icon.svg', 'public/icon-512.png', 512, false],
  ['resources/splash.svg', 'resources/ios/Splash-2732.png', 2732, true],
];

async function main() {
  for (const [from, to, size, opaque] of TARGETS) {
    const svg = await readFile(resolve(root, from));
    const out = resolve(root, to);
    await mkdir(dirname(out), { recursive: true });

    let pipeline = sharp(svg, { density: 400 }).resize(size, size, {
      fit: 'cover',
      background: BACKGROUND,
    });

    // `flatten` is what actually removes the alpha channel — without it a PNG
    // keeps one even when nothing in the image is transparent, and App Store
    // Connect rejects the upload.
    if (opaque) pipeline = pipeline.flatten({ background: BACKGROUND });

    const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    await writeFile(out, buffer);

    const meta = await sharp(buffer).metadata();
    console.log(
      `  ${to.padEnd(38)} ${meta.width}×${meta.height}  ${meta.hasAlpha ? 'alpha' : 'opaque'}`,
    );

    if (opaque && meta.hasAlpha) {
      throw new Error(`${to} still has an alpha channel; App Store Connect will reject it.`);
    }
  }
  console.log('\nIcons written.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
