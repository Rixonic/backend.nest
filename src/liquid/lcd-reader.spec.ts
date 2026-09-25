import { readFileSync } from 'fs';
import { join } from 'path';
import { decode, encode } from 'jpeg-js';
import { readLcd } from './lcd-reader';

const load = (file: string): Buffer =>
  readFileSync(join(__dirname, '__fixtures__', file));

/**
 * Simula un reencuadre: zoom `k` respecto del centro de la imagen y luego un
 * desplazamiento (dx, dy) px, rellenando con gris.
 */
function reframed(file: string, dx: number, dy: number, k = 1): Buffer {
  const src = decode(load(file), { useTArray: true });
  const { width, height } = src;
  const [cx, cy] = [width / 2, height / 2];
  const out = new Uint8Array(src.data.length).fill(128);
  for (let y = 0; y < height; y++) {
    const sy = Math.round((y - dy - cy) / k + cy);
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < width; x++) {
      const sx = Math.round((x - dx - cx) / k + cx);
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
    // Noche (21:41): mucho ruido y bloques JPEG; cámara corrida (-20, -8),
    // fuera del alcance del registro original (±12 px).
    ['lcd-2596-night.jpg', 2596],
    // Noche con la cámara en modo auto (luz blanca ColorVu encendida). El zoom
    // motorizado había crecido ~3 % y la imagen estaba corrida (-31, -26).
    ['lcd-2576-night-light.jpg', 2576],
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
    [-22, -12],
    [25, 20],
    [-28, 15],
    [-45, -40],
  ])('tolera un corrimiento de la cámara (%i, %i)', (dx, dy) => {
    const r = readLcd(reframed('lcd-2860.jpg', dx, dy));
    expect(r.value).toBe(2860);
  });

  it.each([
    [1.05, 0, 0],
    [0.95, 0, 0],
    [1.08, -20, 10],
    [0.93, 15, -15],
  ])('tolera un cambio de zoom x%f con corrimiento (%i, %i)', (k, dx, dy) => {
    const r = readLcd(reframed('lcd-2860.jpg', dx, dy, k));
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
