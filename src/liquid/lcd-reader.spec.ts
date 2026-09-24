import { readFileSync } from 'fs';
import { join } from 'path';
import { decode, encode } from 'jpeg-js';
import { readLcd } from './lcd-reader';

const load = (file: string): Buffer =>
  readFileSync(join(__dirname, '__fixtures__', file));

/** Desplaza la imagen (dx, dy) px rellenando con gris, simulando un leve reencuadre. */
function shifted(file: string, dx: number, dy: number): Buffer {
  const src = decode(load(file), { useTArray: true });
  const { width, height } = src;
  const out = new Uint8Array(src.data.length).fill(128);
  for (let y = 0; y < height; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < width; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= width) continue;
      const d = (y * width + x) * 4;
      const s = (sy * width + sx) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = src.data[s + c];
    }
  }
  return encode({ data: out, width, height }, 90).data;
}

describe('readLcd', () => {
  it.each([
    ['lcd-2860.jpg', 2860],
    // Tomada ~1 h después: la cámara ya se había corrido 2 px (dx = -2).
    ['lcd-2853.jpg', 2853],
    // Cámara corrida (-5, -2) y reflejo de sol sobre el primer dígito.
    ['lcd-2794.jpg', 2794],
    // Atardecer (19:09): fondo del LCD a la mitad de brillo, mucho ruido y
    // contraste de los segmentos a ~1/3 del diurno. Cámara corrida (-7, -3).
    ['lcd-2648-dusk.jpg', 2648],
  ])('lee el nivel del snapshot real %s', (file, expected) => {
    const r = readLcd(load(file));
    expect(r.error).toBeUndefined();
    expect(r.value).toBe(expected);
  });

  it.each([
    [5, 0],
    [10, -9],
    [-5, 3],
    [3, -6],
    [-7, -7],
  ])('tolera un corrimiento de la cámara (%i, %i)', (dx, dy) => {
    const r = readLcd(shifted('lcd-2860.jpg', dx, dy));
    expect(r.value).toBe(2860);
  });

  it('descarta una imagen sin display', () => {
    const [width, height] = [2560, 1440];
    const gray = new Uint8Array(width * height * 4).fill(128);
    const r = readLcd(encode({ data: gray, width, height }, 90).data);
    expect(r.value).toBeNull();
  });

  it('descarta un snapshot de menor resolución', () => {
    const [width, height] = [640, 360];
    const gray = new Uint8Array(width * height * 4).fill(128);
    const r = readLcd(encode({ data: gray, width, height }, 90).data);
    expect(r.value).toBeNull();
    expect(r.error).toMatch(/resolución/);
  });
});
