import * as fs from 'fs';
import * as path from 'path';

/**
 * Assets estáticos de las plantillas de PDF, embebidos como data URI / inline.
 *
 * Si los logos, la fuente y Chart.js se dejan como URL remota, Chromium los
 * descarga en cada render y `setContent` (waitUntil 'load' por defecto) bloquea
 * hasta que terminan. En una red sin salida eso son 30 s de renderer vivo por
 * PDF, y si Chart.js no llega el gráfico sale en blanco sin ningún error.
 * Leemos todo de disco una sola vez y lo cacheamos.
 */

const cache = new Map<string, string>();

function readTextOnce(abs: string): string {
  let txt = cache.get(abs);
  if (txt === undefined) {
    if (!fs.existsSync(abs)) {
      throw new Error(`Asset de plantilla no encontrado: ${abs}`);
    }
    txt = fs.readFileSync(abs, 'utf-8');
    cache.set(abs, txt);
  }
  return txt;
}

function readDataUriOnce(abs: string, mime: string): string {
  const key = `datauri:${abs}`;
  let uri = cache.get(key);
  if (uri === undefined) {
    if (!fs.existsSync(abs)) {
      throw new Error(`Asset de plantilla no encontrado: ${abs}`);
    }
    uri = `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
    cache.set(key, uri);
  }
  return uri;
}

/**
 * Raíz del proyecto anclada a `__dirname`, no a `process.cwd()`.
 *
 * El cwd es el directorio desde donde se lanzó el proceso, no donde vive el
 * código: pm2 lo persiste en su dump, así que un `pm2 resurrect` tras un reboot
 * o un `pm2 start` desde otro directorio lo cambian, y el fallo recién
 * aparecería en el primer request de PDF. Tanto `src/pdf/` (dev) como
 * `dist/pdf/` (prod) están dos niveles bajo la raíz.
 */
const PROJECT_ROOT = path.join(__dirname, '..', '..');

export const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'src', 'pdf', 'templates');
const NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules');

const LOGO_COMPLETO_URL =
  'https://hsjd.minio.frank4.com.ar/public/LogoSJD-Completo.png';
const LOGO_LABORATORIO_URL =
  'https://hsjd.minio.frank4.com.ar/public/LogoSJD-Laboratorio.png';

const LOGO_COMPLETO_FILE = path.join(TEMPLATES_DIR, 'logoSJD-Completo.png');
const LOGO_LABORATORIO_FILE = path.join(TEMPLATES_DIR, 'LogoSJD-Laboratorio.png');

const FONT_400_FILE = path.join(TEMPLATES_DIR, 'fonts', 'SourceSansPro-latin-400.woff2');
const FONT_700_FILE = path.join(TEMPLATES_DIR, 'fonts', 'SourceSansPro-latin-700.woff2');

const CHART_JS_FILE = path.join(NODE_MODULES, 'chart.js', 'dist', 'chart.umd.js');
const CHART_ADAPTER_FILE = path.join(
  NODE_MODULES,
  'chartjs-adapter-date-fns',
  'dist',
  'chartjs-adapter-date-fns.bundle.js',
);

const GOOGLE_FONTS_TAG = /[ \t]*<link[^>]*fonts\.googleapis\.com[^>]*>/g;
const CHART_JS_TAG =
  /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js"><\/script>/;
const CHART_ADAPTER_TAG =
  /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chartjs-adapter-date-fns"><\/script>/;

/**
 * Bloque <style> con Source Sans Pro embebido como @font-face base64.
 *
 * A diferencia de Open Sans en hsjd, Source Sans Pro v23 es una fuente
 * estática: hacen falta dos archivos y dos @font-face (400 y 700) en lugar de
 * uno con `font-weight: 400 700`. Se omite `unicode-range` a propósito para que
 * un glifo fuera del subset latin caiga al sans-serif del sistema en vez de
 * renderizar tofu. `font-display: block` en vez de `swap` porque acá el
 * objetivo es un PDF determinista: no queremos que un frame con la fuente de
 * fallback llegue a la impresión (con data URI la carga es inmediata igual).
 */
let sourceSansProStyle: string | null = null;
function getSourceSansProStyle(): string {
  if (sourceSansProStyle === null) {
    const regular = readDataUriOnce(FONT_400_FILE, 'font/woff2');
    const bold = readDataUriOnce(FONT_700_FILE, 'font/woff2');
    sourceSansProStyle = `<style>
@font-face {
  font-family: 'Source Sans Pro';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(${regular}) format('woff2');
}
@font-face {
  font-family: 'Source Sans Pro';
  font-style: normal;
  font-weight: 700;
  font-display: block;
  src: url(${bold}) format('woff2');
}
</style>`;
  }
  return sourceSansProStyle;
}

/**
 * Sustituye los recursos remotos de las plantillas por su equivalente local.
 * Debe aplicarse DESPUÉS de los reemplazos de `{{...}}`.
 *
 * Los `.replace` con función no son casuales: el fuente de Chart.js contiene
 * secuencias `$` que un replacement string interpretaría como $&, $', $1...
 */
export function inlineAssets(html: string): string {
  return html
    .replaceAll(
      LOGO_COMPLETO_URL,
      readDataUriOnce(LOGO_COMPLETO_FILE, 'image/png'),
    )
    .replaceAll(
      LOGO_LABORATORIO_URL,
      readDataUriOnce(LOGO_LABORATORIO_FILE, 'image/png'),
    )
    .replace(GOOGLE_FONTS_TAG, () => getSourceSansProStyle())
    .replace(CHART_JS_TAG, () => `<script>${readTextOnce(CHART_JS_FILE)}</script>`)
    .replace(
      CHART_ADAPTER_TAG,
      () => `<script>${readTextOnce(CHART_ADAPTER_FILE)}</script>`,
    );
}

/**
 * Precarga los assets al arrancar: el primer PDF no paga la lectura y un asset
 * faltante se ve en los logs al bootear, no recién al generar un reporte.
 *
 * Solo advierte, no lanza: este backend además hace Modbus/MQTT y alertas de
 * temperatura, y un logo faltante no puede impedir que arranque.
 */
export function warmUpAssets(): void {
  try {
    readDataUriOnce(LOGO_COMPLETO_FILE, 'image/png');
    readDataUriOnce(LOGO_LABORATORIO_FILE, 'image/png');
    getSourceSansProStyle();
    readTextOnce(CHART_JS_FILE);
    readTextOnce(CHART_ADAPTER_FILE);
    console.log('[pdf] assets de plantilla precargados');
  } catch (error) {
    console.warn(`[pdf] assets de plantilla incompletos: ${error.message}`);
  }
}
