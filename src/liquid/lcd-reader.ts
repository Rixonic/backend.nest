import { decode as decodeJpeg } from 'jpeg-js';

/**
 * Lector del display LCD de 7 segmentos del Linde Hawkeye (línea superior =
 * nivel del tanque de oxígeno líquido en kg) a partir de un snapshot de la
 * cámara fija. Visión clásica, sin IA: como la cámara no se mueve, cada
 * segmento de cada dígito tiene una posición conocida en la imagen, y alcanza
 * con medir si está más oscuro que el fondo del LCD.
 *
 * Robustez:
 * - Registro contra la ventana del LCD, sin depender de los dígitos: se ubican
 *   sus cuatro bordes (salto de brillo carcasa clara → vidrio oscuro) dentro de
 *   ±`EDGE_SEARCH` px de la calibración, y de ahí salen el corrimiento y la
 *   escala con que se mapean las posiciones calibradas de los segmentos. El
 *   encuadre cambia (el 24/09 se corrió -31 px y el zoom motorizado creció
 *   ~3 %). Alinear "buscando el corrimiento que mejor decodifica" no sirve:
 *   corrido 3-4 px, el LCD sigue dando números válidos pero incorrectos
 *   (p. ej. 2868 en lugar de 2860).
 * - Contraste local: cada segmento se compara contra el LCD a ambos lados de
 *   él (perpendicular al segmento). Tolera cambios de iluminación a lo largo
 *   del día y, sobre todo, reflejos sobre el vidrio: un reflejo es un gradiente
 *   de brillo que puede variar ~40 niveles en 10 px, y comparar contra un fondo
 *   único por dígito lo confunde con segmentos (así se perdía el primer dígito
 *   con sol sobre la esquina inferior izquierda del display).
 * - Búsqueda local de ±`LOCAL_RANGE` px por segmento (el LCD tiene cursiva y un
 *   paso entre dígitos no del todo uniforme).
 * - Validación estricta: si no se encuentra el marco, algún dígito no es un
 *   patrón válido o el contraste no alcanza, la lectura se descarta (nunca se
 *   "adivina" un valor).
 */

/**
 * Calibración para el encuadre actual (snapshot 2560x1440). Si se mueve la
 * cámara o se cambia el zoom más allá de lo que cubre el registro, hay que
 * recalibrar con un snapshot nuevo:
 * - `WINDOW`: bordes de la ventana del LCD según `edgeAt` (el derecho, debajo
 *   del escalón de la esquina superior derecha).
 * - `DIGIT0`: centro del segmento superior (a) del primer dígito.
 * - `DIGIT_PITCH`: distancia entre dígitos.
 */
const WINDOW = { left: 995, right: 1200, top: 239, bottom: 453 };
/**
 * Franjas donde se miden los bordes: `SIDE_BAND` (filas, bordes izq./der.)
 * esquiva las etiquetas "kg"/"bar" y el escalón; `CAP_BAND` (columnas, bordes
 * sup./inf.) cae dentro del vidrio para cualquier corrimiento buscado.
 */
const SIDE_BAND = { from: 340, to: 400 };
const CAP_BAND = { from: 1050, to: 1130 };
const DIGIT0 = { x: 1082.5, y: 248.5 };
const DIGIT_PITCH = 33.5;
const DIGIT_COUNT = 4;

type Orientation = 'h' | 'v';

/** Centro de cada segmento relativo al segmento `a` (incluye la cursiva). */
const SEGMENTS: [dx: number, dy: number, o: Orientation][] = [
  [0, 0, 'h'], // a
  [7, 9, 'v'], // b
  [4, 30, 'v'], // c
  [-3, 38.5, 'h'], // d
  [-11, 30, 'v'], // e
  [-8, 9, 'v'], // f
  [-1, 19, 'h'], // g
];

/** Patrones abcdefg → dígito. `6` y `9` con y sin la "colita". */
const PATTERNS: Record<string, number> = {
  '1111110': 0,
  '0110000': 1,
  '1101101': 2,
  '1111001': 3,
  '0110011': 4,
  '1011011': 5,
  '1011111': 6,
  '0011111': 6,
  '1110000': 7,
  '1111111': 8,
  '1111011': 9,
  '1110011': 9,
};
const BLANK = '0000000';

/** Corrimiento máximo de cada borde de la ventana que se busca (px). */
const EDGE_SEARCH = 50;
/** Salto de brillo mínimo (carcasa − vidrio) para dar un borde por encontrado. */
const MIN_EDGE_STEP = 40;
/**
 * Escala admitida respecto de la calibración, y diferencia máxima entre la
 * horizontal y la vertical (un zoom es parejo; si difieren, algún borde se
 * detectó mal).
 */
const SCALE_RANGE = { min: 0.9, max: 1.15 };
const MAX_SCALE_SKEW = 0.03;
const LOCAL_RANGE = 2;
/**
 * Distancia (px) del centro del segmento a cada flanco con el que se compara.
 * Con 5 o más, el flanco superior del segmento `a` alcanza el marco del LCD.
 */
const FLANK = 4;
/**
 * Separación mínima entre el segmento encendido más débil y el apagado más
 * fuerte, relativa al contraste medio de los encendidos. Es relativa porque el
 * contraste escala con la luz: al atardecer el fondo del LCD cae de ~90 a ~45
 * niveles de gris y los segmentos encendidos pasan de ~45 a ~16 de contraste,
 * aunque el corte sigue siendo nítido (margen ~0,3 del contraste medio, contra
 * ~0,5-0,6 de día). `MIN_GAP` es un piso absoluto contra el ruido del sensor.
 */
const MIN_GAP_RATIO = 0.2;
const MIN_GAP = 3;
/** Contraste medio mínimo de los segmentos encendidos (display legible). */
const MIN_ON_CONTRAST = 8;

/** Región que se recorta del snapshot: marco + dígitos + margen de búsqueda. */
const REGION = { left: 935, top: 180, width: 325, height: 330 };

export interface LcdReading {
  /** Valor leído (kg), o `null` si la lectura no es confiable. */
  value: number | null;
  /** Dígitos decodificados (`' '` = apagado, `'?'` = patrón inválido). */
  digits: string;
  /** Separación entre segmentos encendidos y apagados (mayor = más confiable). */
  gap: number;
  /** Corrimiento de la ventana del LCD respecto de la calibración (px). */
  shift: { dx: number; dy: number };
  /** Escala de la ventana del LCD respecto de la calibración (zoom). */
  scale: { sx: number; sy: number };
  /** Motivo del descarte cuando `value` es `null`. */
  error?: string;
}

interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

export function readLcd(jpeg: Buffer): LcdReading {
  const img = cropGray(jpeg);
  if (!img) {
    return {
      value: null,
      digits: '',
      gap: 0,
      shift: { dx: 0, dy: 0 },
      scale: { sx: 1, sy: 1 },
      error: 'resolución del snapshot menor a la calibrada',
    };
  }

  const win = findWindow(img);
  const shift = { dx: win.left - WINDOW.left, dy: win.top - WINDOW.top };
  const scale = {
    sx: (win.right - win.left) / (WINDOW.right - WINDOW.left),
    sy: (win.bottom - win.top) / (WINDOW.bottom - WINDOW.top),
  };
  const noWindow = (error: string): LcdReading => ({
    value: null,
    digits: '',
    gap: 0,
    shift,
    scale,
    error,
  });
  if (!win.found) return noWindow('no se encontró el marco del LCD');
  if (
    Math.min(scale.sx, scale.sy) < SCALE_RANGE.min ||
    Math.max(scale.sx, scale.sy) > SCALE_RANGE.max ||
    Math.abs(scale.sx - scale.sy) > MAX_SCALE_SKEW
  ) {
    return noWindow('tamaño del marco del LCD fuera de rango');
  }

  const { digits, gap, onMean } = decode(measure(img, win, scale));

  const fail = (error: string): LcdReading => ({
    value: null,
    digits,
    gap,
    shift,
    scale,
    error,
  });
  if (onMean < MIN_ON_CONTRAST) return fail('display sin contraste suficiente');
  if (gap < Math.max(MIN_GAP, MIN_GAP_RATIO * onMean)) {
    return fail('segmentos ambiguos');
  }
  if (digits.includes('?')) return fail('patrón de dígito inválido');
  // Solo se admiten blancos a la izquierda (ceros no significativos apagados).
  if (!/^ *\d+$/.test(digits)) return fail('formato de número inválido');

  return { value: Number(digits.trim()), digits, gap, shift, scale };
}

/**
 * Decodifica el JPEG y devuelve `REGION` en escala de grises (luminancia
 * Rec. 709). Se usa `jpeg-js` (JavaScript puro) en lugar de `sharp`: los
 * binarios precompilados de `sharp` exigen CPU x86-64-v2 y el servidor de
 * producción no la tiene. Decodificar el cuadro completo tarda ~250 ms, de
 * sobra para una captura cada 15 min.
 */
function cropGray(jpeg: Buffer): Gray | null {
  const rgb = decodeJpeg(jpeg, { useTArray: true, formatAsRGBA: false });
  if (
    rgb.width < REGION.left + REGION.width ||
    rgb.height < REGION.top + REGION.height
  ) {
    return null;
  }
  const data = new Uint8Array(REGION.width * REGION.height);
  for (let y = 0; y < REGION.height; y++) {
    for (let x = 0; x < REGION.width; x++) {
      const i = ((REGION.top + y) * rgb.width + REGION.left + x) * 3;
      data[y * REGION.width + x] = Math.round(
        0.2126 * rgb.data[i] +
          0.7152 * rgb.data[i + 1] +
          0.0722 * rgb.data[i + 2],
      );
    }
  }
  return { data, width: REGION.width, height: REGION.height };
}

interface Window {
  left: number;
  right: number;
  top: number;
  bottom: number;
  found: boolean;
}

/**
 * Ubica los cuatro bordes de la ventana del LCD (salto de brillo carcasa →
 * vidrio) dentro de ±`EDGE_SEARCH` px de su posición calibrada. Los bordes se
 * buscan de a pares opuestos (izq./der., sup./inf.), eligiendo el par con más
 * salto entre los que están a una distancia compatible con `SCALE_RANGE`: así
 * se admite un cambio de zoom y un borde debilitado por un reflejo no se
 * confunde con el de la carcasa del equipo, que queda más afuera.
 */
function findWindow(img: Gray): Window {
  const h = edgePair(img, 'x', WINDOW.left, WINDOW.right);
  const v = edgePair(img, 'y', WINDOW.top, WINDOW.bottom);
  return {
    left: h.near,
    right: h.far,
    top: v.near,
    bottom: v.far,
    found: h.found && v.found,
  };
}

/**
 * Mejor par de bordes opuestos sobre `axis`: `near` (vidrio hacia coordenadas
 * mayores) y `far` (vidrio hacia menores), cerca de sus posiciones calibradas.
 */
function edgePair(
  img: Gray,
  axis: 'x' | 'y',
  near0: number,
  far0: number,
): { near: number; far: number; found: boolean } {
  const nearSteps = edgeSteps(img, axis, near0, 1);
  const farSteps = edgeSteps(img, axis, far0, -1);
  let best = { near: near0, far: far0, step: -Infinity, found: false };
  for (let i = 0; i < nearSteps.length; i++) {
    for (let j = 0; j < farSteps.length; j++) {
      const near = near0 - EDGE_SEARCH + i;
      const far = far0 - EDGE_SEARCH + j;
      const scale = (far - near) / (far0 - near0);
      if (scale < SCALE_RANGE.min || scale > SCALE_RANGE.max) continue;
      const step = nearSteps[i] + farSteps[j];
      if (step > best.step) {
        best = {
          near,
          far,
          step,
          found: Math.min(nearSteps[i], farSteps[j]) >= MIN_EDGE_STEP,
        };
      }
    }
  }
  return best;
}

/**
 * Salto carcasa − vidrio para cada posición dentro de ±`EDGE_SEARCH` px de
 * `calibrated` (coordenada absoluta sobre `axis`), medido entre franjas de
 * 2-5 px a cada lado sobre `SIDE_BAND` (bordes izq./der.) o `CAP_BAND`
 * (sup./inf.). `inward` = +1 si el vidrio queda hacia coordenadas mayores.
 */
function edgeSteps(
  img: Gray,
  axis: 'x' | 'y',
  calibrated: number,
  inward: 1 | -1,
): number[] {
  const band = axis === 'x' ? SIDE_BAND : CAP_BAND;
  const mid = (band.from + band.to) / 2;
  const len = band.to - band.from;
  // Franja de 4 px centrada en `c` (coordenada absoluta) sobre el eje buscado.
  const strip = (c: number): number =>
    axis === 'x'
      ? mean(img, c - REGION.left, mid - REGION.top, 4, len)
      : mean(img, mid - REGION.left, c - REGION.top, len, 4);
  const steps: number[] = [];
  for (let o = -EDGE_SEARCH; o <= EDGE_SEARCH; o++) {
    const at = calibrated + o;
    steps.push(strip(at - 3.5 * inward) - strip(at + 3.5 * inward));
  }
  return steps;
}

interface Decoded {
  digits: string;
  gap: number;
  onMean: number;
}

/** Clasifica los contrastes en encendido/apagado y los traduce a dígitos. */
function decode(contrasts: number[]): Decoded {
  const { threshold, gap, onMean } = split(contrasts);
  let digits = '';
  for (let i = 0; i < DIGIT_COUNT; i++) {
    const bits = contrasts
      .slice(i * 7, i * 7 + 7)
      .map((c) => (c > threshold ? '1' : '0'))
      .join('');
    digits += bits === BLANK ? ' ' : (PATTERNS[bits]?.toString() ?? '?');
  }
  return { digits, gap, onMean };
}

/**
 * Contraste (flancos − segmento) de los 7 segmentos de cada dígito, en orden.
 * Promediar los dos flancos cancela un gradiente de brillo (reflejo) que
 * atraviese el segmento.
 */
function measure(
  img: Gray,
  win: Window,
  scale: { sx: number; sy: number },
): number[] {
  const out: number[] = [];
  for (let i = 0; i < DIGIT_COUNT; i++) {
    for (const [x, y, o] of SEGMENTS) {
      // Posición calibrada del segmento, llevada al encuadre actual.
      const ax =
        win.left + (DIGIT0.x + DIGIT_PITCH * i + x - WINDOW.left) * scale.sx;
      const ay = win.top + (DIGIT0.y + y - WINDOW.top) * scale.sy;
      // Búsqueda local, sobre todo en el eje perpendicular al segmento.
      const rx = o === 'v' ? LOCAL_RANGE : 1;
      const ry = o === 'h' ? LOCAL_RANGE : 1;
      const [w, h] = o === 'h' ? [12, 3] : [3, 12];
      const [fx, fy] = o === 'h' ? [0, FLANK] : [FLANK, 0];
      let c = -Infinity;
      for (let ly = -ry; ly <= ry; ly++) {
        for (let lx = -rx; lx <= rx; lx++) {
          const cx = ax - REGION.left + lx;
          const cy = ay - REGION.top + ly;
          const bg =
            (mean(img, cx - fx, cy - fy, w, h) +
              mean(img, cx + fx, cy + fy, w, h)) /
            2;
          c = Math.max(c, bg - mean(img, cx, cy, w, h));
        }
      }
      out.push(c);
    }
  }
  return out;
}

/** Media de gris de un rectángulo `w`×`h` centrado en (`cx`, `cy`). */
function mean(img: Gray, cx: number, cy: number, w: number, h: number): number {
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - h / 2);
  let sum = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) sum += img.data[y * img.width + x];
  }
  return sum / (w * h);
}

/**
 * Separa los contrastes en apagado/encendido por el mayor salto entre valores
 * consecutivos ordenados, buscándolo solo en la zona baja: un segmento apagado
 * es del mismo material que el fondo (contraste ≈ 0), mientras que los
 * encendidos varían mucho entre sí (reflejos, ángulo de visión del LCD), así
 * que un salto dentro del grupo encendido no debe tomarse como el corte.
 * Devuelve el umbral, el margen del corte y la media del grupo encendido.
 */
function split(values: number[]): {
  threshold: number;
  gap: number;
  onMean: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const onLevel = sorted[Math.floor(sorted.length * 0.9)];
  let gap = -Infinity;
  let k = sorted.length - 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1] >= onLevel / 2) break;
    const g = sorted[i] - sorted[i - 1];
    if (g > gap) {
      gap = g;
      k = i;
    }
  }
  const on = sorted.slice(k);
  return {
    threshold: (sorted[k - 1] + sorted[k]) / 2,
    gap,
    onMean: on.reduce((s, v) => s + v, 0) / on.length,
  };
}
