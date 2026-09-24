import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/configuration';
import { AlertGateway } from '../notifications/alert.gateway';
import { OxygenLiquidService } from '../services/oxigeno/oxigeno.service';
import { fetchSnapshot } from './hikvision-snapshot';
import { LcdReading, readLcd } from './lcd-reader';

/** Fotos máximas por ciclo; se persiste cuando dos lecturas coinciden. */
const MAX_ATTEMPTS = 3;
const ATTEMPT_DELAY_MS = 1000;
const DAY_MS = 86_400_000;

export interface LiquidSnapshot {
  /** Último nivel persistido (kg). */
  measure: number | null;
  timestamp: Date | null;
  /** Resultado del último ciclo de captura, haya persistido o no. */
  lastAttempt: { at: Date; ok: boolean; error?: string } | null;
}

/**
 * Nivel del tanque de oxígeno líquido leído por cámara. Cada `liquidCapture`
 * (15 min) pide snapshots a la cámara Hikvision por ISAPI, decodifica el LCD
 * del Linde Hawkeye (`readLcd`) y, si dos fotos seguidas dan el mismo valor,
 * lo persiste en `oxigeno.liquid` y lo difunde por WebSocket (evento
 * `liquid`). Sin alertas. Una lectura dudosa se descarta: es preferible un
 * hueco en el histórico a un valor mal leído.
 */
@Injectable()
export class LiquidMonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LiquidMonitorService.name);
  private state: LiquidSnapshot = {
    measure: null,
    timestamp: null,
    lastAttempt: null,
  };
  /** Último JPEG capturado, para verificar el encuadre (`GET /oxigeno/liquid/image`). */
  private lastImage: Buffer | null = null;
  private running = false;
  /** Carpeta del archivo de fotos, o `null` si está desactivado. */
  private archiveDir: string | null = null;
  private archiveWarned = false;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly gateway: AlertGateway,
    private readonly liquid: OxygenLiquidService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('flags', { infer: true }).acquisitionEnabled) return;

    if (!this.config.get('cameras', { infer: true }).liquid.pass) {
      this.logger.warn(
        'LIQUID_CAMERA_PASS no configurada; monitor de oxígeno líquido inactivo',
      );
      return;
    }

    const archive = this.config.get('cameras', { infer: true }).liquidArchive;
    if (archive.keepDays > 0) {
      this.archiveDir = resolve(archive.dir);
      this.logger.log(
        `Fotos del LCD archivadas en ${this.archiveDir} (${archive.keepDays} días)`,
      );
    }

    const ms = this.config.get('intervals', { infer: true }).liquidCapture;
    const handle = setInterval(() => void this.capture(), ms);
    this.scheduler.addInterval('liquid-capture', handle);
    // Primera lectura al arrancar, sin esperar el primer intervalo.
    void this.capture();
    this.logger.log(
      `Monitor de oxígeno líquido iniciado (cada ${ms / 60_000} min)`,
    );
  }

  getSnapshot(): LiquidSnapshot {
    return this.state;
  }

  getLastImage(): Buffer | null {
    return this.lastImage;
  }

  private async capture(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const at = new Date();
    try {
      const value = await this.readStable();
      await this.liquid.create(at, value);
      this.state = {
        measure: value,
        timestamp: at,
        lastAttempt: { at, ok: true },
      };
      this.gateway.broadcast('liquid', { measure: value, timestamp: at });
    } catch (err) {
      const error = (err as Error).message;
      this.state = { ...this.state, lastAttempt: { at, ok: false, error } };
      this.logger.warn(`Lectura de oxígeno líquido descartada: ${error}`);
    } finally {
      this.running = false;
      void this.pruneArchive();
    }
  }

  /** Captura hasta `MAX_ATTEMPTS` fotos y devuelve el valor que se repita. */
  private async readStable(): Promise<number> {
    const camera = this.config.get('cameras', { infer: true }).liquid;
    const seen: number[] = [];
    const failures: string[] = [];

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, ATTEMPT_DELAY_MS));

      let reading: LcdReading;
      try {
        const jpeg = await fetchSnapshot(camera);
        this.lastImage = jpeg;
        reading = readLcd(jpeg);
        void this.archive(jpeg, i, reading);
      } catch (err) {
        // Un error de la cámara (red, credenciales) no se arregla reintentando
        // en el mismo segundo; y con 401 conviene no insistir (bloqueo de IP).
        throw new Error(`cámara: ${(err as Error).message}`);
      }

      if (reading.value === null) {
        failures.push(`${reading.error} [${reading.digits}]`);
        continue;
      }
      if (seen.includes(reading.value)) return reading.value;
      seen.push(reading.value);
    }

    throw new Error(
      `sin dos lecturas coincidentes (valores: ${seen.join(', ') || '-'}; fallos: ${failures.join('; ') || '-'})`,
    );
  }

  /**
   * Guarda la foto en el archivo en disco, con el resultado de la lectura en el
   * nombre (`2026-09-24_19-09-33_1_2648.jpg`, o `..._fail.jpg`), para analizar
   * o recalibrar el lector después. Un error de disco nunca frena la captura.
   */
  private async archive(
    jpeg: Buffer,
    attempt: number,
    reading: LcdReading,
  ): Promise<void> {
    if (!this.archiveDir) return;
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp =
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
      `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    const result = reading.value ?? 'fail';
    try {
      await mkdir(this.archiveDir, { recursive: true });
      await writeFile(
        join(this.archiveDir, `${stamp}_${attempt + 1}_${result}.jpg`),
        jpeg,
      );
    } catch (err) {
      this.warnArchive(err);
    }
  }

  /** Borra las fotos archivadas más viejas que `keepDays`. */
  private async pruneArchive(): Promise<void> {
    if (!this.archiveDir) return;
    const { keepDays } = this.config.get('cameras', {
      infer: true,
    }).liquidArchive;
    const limit = Date.now() - keepDays * DAY_MS;
    try {
      for (const name of await readdir(this.archiveDir)) {
        if (!name.endsWith('.jpg')) continue;
        const file = join(this.archiveDir, name);
        if ((await stat(file)).mtimeMs < limit) await unlink(file);
      }
    } catch (err) {
      this.warnArchive(err);
    }
  }

  /** Avisa una sola vez: si el disco falla, fallaría en cada captura. */
  private warnArchive(err: unknown): void {
    if (this.archiveWarned) return;
    this.archiveWarned = true;
    this.logger.warn(
      `No se pudo archivar la foto del LCD: ${(err as Error).message}`,
    );
  }
}
