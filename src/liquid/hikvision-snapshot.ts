import { createHash, randomBytes } from 'crypto';

export interface CameraConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Canal ISAPI: `101` = canal 1, stream principal (resolución completa). */
  channel: number;
}

const md5 = (s: string): string => createHash('md5').update(s).digest('hex');

/**
 * Pide un snapshot JPEG a una cámara Hikvision por ISAPI
 * (`/ISAPI/Streaming/channels/{canal}/picture`) con autenticación HTTP Digest.
 * Se prefiere a RTSP: es un solo request HTTP (~0.3 s), sin ffmpeg ni esperar
 * un keyframe, y el JPEG lo codifica la propia cámara.
 *
 * Ojo: Hikvision bloquea temporalmente la IP tras varios intentos de login
 * fallidos, así que ante un 401 con credenciales no se reintenta en loop.
 */
export async function fetchSnapshot(
  cfg: CameraConfig,
  timeoutMs = 10_000,
): Promise<Buffer> {
  const uri = `/ISAPI/Streaming/channels/${cfg.channel}/picture`;
  const url = `http://${cfg.host}:${cfg.port}${uri}`;

  // 1) Request sin credenciales para obtener el challenge Digest.
  const challenge = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  await challenge.arrayBuffer();
  if (challenge.ok) throw new Error('la cámara no pidió autenticación');
  const header = challenge.headers.get('www-authenticate') ?? '';
  if (challenge.status !== 401 || !/^Digest /i.test(header)) {
    throw new Error(
      `respuesta inesperada al challenge: HTTP ${challenge.status}`,
    );
  }

  // 2) Request autenticado.
  const params = parseDigest(header);
  const ha1 = md5(`${cfg.user}:${params.realm}:${cfg.pass}`);
  const ha2 = md5(`GET:${uri}`);
  const nc = '00000001';
  const cnonce = randomBytes(8).toString('hex');
  const qop = params.qop
    ?.split(',')
    .map((q) => q.trim())
    .includes('auth')
    ? 'auth'
    : undefined;
  const response = qop
    ? md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${params.nonce}:${ha2}`);

  const fields = [
    `username="${cfg.user}"`,
    `realm="${params.realm}"`,
    `nonce="${params.nonce}"`,
    `uri="${uri}"`,
    'algorithm=MD5',
    `response="${response}"`,
    ...(qop ? [`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []),
    ...(params.opaque ? [`opaque="${params.opaque}"`] : []),
  ];

  const res = await fetch(url, {
    headers: { Authorization: `Digest ${fields.join(', ')}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = Buffer.from(await res.arrayBuffer());
  if (res.status === 401)
    throw new Error('credenciales de la cámara rechazadas (401)');
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir el snapshot`);
  if (!(res.headers.get('content-type') ?? '').includes('image/jpeg')) {
    throw new Error(
      `el snapshot no es JPEG (${res.headers.get('content-type')})`,
    );
  }
  return body;
}

/** Parsea `Digest realm="...", nonce="...", qop="auth", ...` a un objeto. */
function parseDigest(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  for (const m of header.slice(header.indexOf(' ') + 1).matchAll(re)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3];
  }
  return out;
}
