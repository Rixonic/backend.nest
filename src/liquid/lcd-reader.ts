import { decode as decodeJpeg } from 'jpeg-js';

/**
 * Lector del display LCD de 7 segmentos del Linde Hawkeye (línea superior =
 * nivel del tanque de oxígeno líquido en kg) a partir de un snapshot de la
 * cámara fija. Visión clásica, sin IA: como la cámara no se mueve, cada
 * segmento de cada dígito tiene una posición conocida en la imagen, y alcanza
 * con medir si está más oscuro que el fondo del LCD.
 *
 * Robustez:
 * - Registro contra el marco de la ventana del LCD (línea oscura entre la
 *   carcasa blanca y el vidrio): absorbe vibraciones o un leve reencuadre de
 *   hasta ±`EDGE_SEARCH` px sin depender de los dígitos. Alinear "buscando el
 *   corrimiento que mejor decodifica" no sirve: corrido 3-4 px, el LCD sigue
 *   dando números válidos pero incorrectos (p. ej. 2868 en lugar de 2860).
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
 * - `EDGE_TOP`/`EDGE_LEFT`: fila/columna más oscura del borde superior/izquierdo
 *   del marco de la ventana del LCD.
 * - `DIGIT0`: centro del segmento superior (a) del primer dígito.
 * - `DIGIT_PITCH`: distancia entre dígitos.
 */
const EDGE_TOP = { y: 242, xFrom: 1060, xTo: 1200 };
const EDGE_LEFT = { x: 999, yFrom: 260, yTo: 320 };
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

/** Corrimiento máximo del marco que se busca (px). */
const EDGE_SEARCH = 12;
/** Diferencia mínima de gris entre el marco y su entorno para darlo por encontrado. */
const MIN_EDGE_CONTRAST = 60;
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
const REGION = { left: 975, top: 222, width: 250, height: 100 };

export interface LcdReading {
  /** Valor leído (kg), o `null` si la lectura no es confiable. */
  value: number | null;
  /** Dígitos decodificados (`' '` = apagado, `'?'` = patrón inválido). */
  digits: string;
  /** Separación entre segmentos encendidos y apagados (mayor = más confiable). */
  gap: number;
  /** Corrimiento de la imagen respecto de la calibración, según el marco. */
  shift: { dx: number; dy: number };
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
      error: 'resolución del snapshot menor a la calibrada',
    };
  }

  const top = findEdge(img, 'row');
  const left = findEdge(img, 'col');
  const shift = { dx: left.offset, dy: top.offset };
  if (!top.found || !left.found) {
    return {
      value: null,
      digits: '',
      gap: 0,
      shift,
      error: 'no se encontró el marco del LCD',
    };
  }

  const { digits, gap, onMean } = decode(measure(img, shift.dx, shift.dy));

  const fail = (error: string): LcdReading => ({
    value: null,
    digits,
    gap,
    shift,
    error,
  });
  if (onMean < MIN_ON_CONTRAST) return fail('display sin contraste suficiente');
  if (gap < Math.max(MIN_GAP, MIN_GAP_RATIO * onMean)) {
    return fail('segmentos ambiguos');
  }
  if (digits.includes('?')) return fail('patrón de dígito inválido');
  // Solo se admiten blancos a la izquierda (ceros no significativos apagados).
  if (!/^ *\d+$/.test(digits)) return fail('formato de número inválido');

  return { value: Number(digits.trim()), digits, gap, shift };
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

/**
 * Ubica el borde superior (`row`) o izquierdo (`col`) del marco como la
 * fila/columna más oscura dentro de ±`EDGE_SEARCH` px de la calibración.
 * Devuelve el corrimiento respecto de la posición calibrada.
 */
function findEdge(
  img: Gray,
  kind: 'row' | 'col',
): { offset: number; found: boolean } {
  const profile: number[] = [];
  for (let o = -EDGE_SEARCH; o <= EDGE_SEARCH; o++) {
    let sum = 0;
    let n = 0;
    if (kind === 'row') {
      const y = EDGE_TOP.y + o - REGION.top;
      for (let x = EDGE_TOP.xFrom; x < EDGE_TOP.xTo; x++, n++) {
        sum += img.data[y * img.width + x - REGION.left];
      }
    } else {
      const x = EDGE_LEFT.x + o - REGION.left;
      for (let y = EDGE_LEFT.yFrom; y < EDGE_LEFT.yTo; y++, n++) {
        sum += img.data[(y - REGION.top) * img.width + x];
      }
    }
    profile.push(sum / n);
  }
  const min = Math.min(...profile);
  const max = Math.max(...profile);
  return {
    offset: profile.indexOf(min) - EDGE_SEARCH,
    found: max - min >= MIN_EDGE_CONTRAST,
  };
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
function measure(img: Gray, dx: number, dy: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < DIGIT_COUNT; i++) {
    const ax = DIGIT0.x + DIGIT_PITCH * i + dx - REGION.left;
    const ay = DIGIT0.y + dy - REGION.top;
    for (const [x, y, o] of SEGMENTS) {
      // Búsqueda local, sobre todo en el eje perpendicular al segmento.
      const rx = o === 'v' ? LOCAL_RANGE : 1;
      const ry = o === 'h' ? LOCAL_RANGE : 1;
      const [w, h] = o === 'h' ? [8, 3] : [3, 8];
      const [fx, fy] = o === 'h' ? [0, FLANK] : [FLANK, 0];
      let c = -Infinity;
      for (let ly = -ry; ly <= ry; ly++) {
        for (let lx = -rx; lx <= rx; lx++) {
          const cx = ax + x + lx;
          const cy = ay + y + ly;
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
