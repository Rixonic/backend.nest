import { readFileSync } from 'fs';
import { join } from 'path';
import * as sharp from 'sharp';
import { readLcd } from './lcd-reader';

const fixture = readFileSync(join(__dirname, '__fixtures__', 'lcd-2860.jpg'));

/** Desplaza la imagen (dx, dy) px rellenando con gris, simulando un leve reencuadre. */
async function shifted(dx: number, dy: number): Promise<Buffer> {
  const { width, height } = await sharp(fixture).metadata();
  const padded = await sharp(fixture)
    .extend({
      left: Math.max(dx, 0),
      top: Math.max(dy, 0),
      right: Math.max(-dx, 0),
      bottom: Math.max(-dy, 0),
      background: { r: 128, g: 128, b: 128 },
    })
    .toBuffer();
  return sharp(padded)
    .extract({
      left: Math.max(-dx, 0),
      top: Math.max(-dy, 0),
      width: width!,
      height: height!,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('readLcd', () => {
  it.each([
    ['lcd-2860.jpg', 2860],
    // Tomada ~1 h después: la cámara ya se había corrido 2 px (dx = -2).
    ['lcd-2853.jpg', 2853],
  ])('lee el nivel del snapshot real %s', async (file, expected) => {
    const r = await readLcd(
      readFileSync(join(__dirname, '__fixtures__', file)),
    );
    expect(r.error).toBeUndefined();
    expect(r.value).toBe(expected);
  });

  it.each([
    [5, 0],
    [10, -9],
    [-5, 3],
    [3, -6],
    [-7, -7],
  ])('tolera un corrimiento de la cámara (%i, %i)', async (dx, dy) => {
    const r = await readLcd(await shifted(dx, dy));
    expect(r.value).toBe(2860);
  });

  it('descarta una imagen sin display', async () => {
    const blank = await sharp({
      create: { width: 2560, height: 1440, channels: 3, background: '#808080' },
    })
      .jpeg()
      .toBuffer();
    const r = await readLcd(blank);
    expect(r.value).toBeNull();
  });
});
