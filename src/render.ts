/**
 * render.ts — draws the moon disc on a canvas and exports PNG bytes.
 *
 * The glasses image container accepts encoded image data and the host
 * converts it to 4-bit greyscale (see `imageToGray4Failed` result code), so
 * we render greyscale-on-black and ship a PNG.
 */

import type { MoonPhase } from './moon';

export const MOON_IMG_SIZE = 100; // height must stay <=100: docs claim 144, hardware rejects it

/**
 * Which limb is lit:
 *  - Northern hemisphere: waxing = right side lit, waning = left.
 *  - Southern hemisphere: mirrored.
 */
export function litSide(phase: MoonPhase, latitude: number): 'left' | 'right' {
  const northView = phase.waxing ? 'right' : 'left';
  if (latitude >= 0) return northView;
  return northView === 'right' ? 'left' : 'right';
}

/**
 * Draw the moon into a canvas 2D context, row by row.
 * For each scanline the limb half-width is w = sqrt(R² − y²) and the
 * terminator sits at x = −(2f − 1)·w on the lit side, which degenerates to a
 * straight line at the quarters and to the limb at new/full — the classic
 * terminator-ellipse construction.
 */
export function drawMoon(
  ctx: CanvasRenderingContext2D,
  size: number,
  phase: MoonPhase,
  side: 'left' | 'right',
): void {
  const c = size / 2;
  const R = size / 2 - 3;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // Dark side of the disc: faint, so the full outline is always readable.
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();

  // Lit region, scanline by scanline.
  const f = phase.fraction;
  ctx.fillStyle = '#e8e8e8';
  for (let row = -Math.floor(R); row <= Math.floor(R); row++) {
    const w = Math.sqrt(Math.max(0, R * R - row * row));
    const xt = -(2 * f - 1) * w; // terminator x, lit-right convention
    let x0: number;
    let x1: number;
    if (side === 'right') {
      x0 = xt;
      x1 = w;
    } else {
      x0 = -w;
      x1 = -xt;
    }
    if (x1 > x0) {
      ctx.fillRect(c + x0, c + row - 0.5, x1 - x0, 1);
    }
  }

  // A few dim maria for character, clipped to the disc.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  const maria: Array<[number, number, number]> = [
    [-0.25, -0.3, 0.22],
    [0.2, -0.12, 0.16],
    [-0.05, 0.22, 0.19],
    [0.32, 0.3, 0.1],
  ];
  for (const [mx, my, mr] of maria) {
    ctx.beginPath();
    ctx.arc(c + mx * R, c + my * R, mr * R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Thin rim so a new moon is still visible.
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.stroke();
}

/** Render the moon and return PNG bytes as number[] (the host's preferred shape). */
export async function renderMoonPng(
  phase: MoonPhase,
  side: 'left' | 'right',
  size: number = MOON_IMG_SIZE,
): Promise<number[]> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  drawMoon(ctx, size, phase, side);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    ),
  );
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}
