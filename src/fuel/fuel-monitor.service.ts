import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as net from 'net';
import { AppConfig, FuelDeviceConfig } from '../config/configuration';
import { AlertGateway } from '../notifications/alert.gateway';

export type FuelStatus = 'ok' | 'offline' | 'no-data';

export interface FuelSnapshotItem {
  id: string;
  name: string;
  level: number | null;
  status: FuelStatus;
  /** ISO de la última trama válida (null si nunca llegó una). */
  updatedAt: string | null;
}

interface FuelDeviceState {
  config: FuelDeviceConfig;
  socket: net.Socket | null;
  buffer: string;
  level: number | null;
  status: FuelStatus;
  /** ms epoch de la última trama válida; se inicializa en el arranque. */
  lastFrameAt: number;
  /** true si alguna vez llegó una trama válida (para `updatedAt`). */
  hasFrame: boolean;
  reconnectTimer: NodeJS.Timeout | null;
  /** Hubo un fallo de conexión ya logueado (evita inundar el log en cada reintento). */
  failing: boolean;
  /** Tramas descartadas por inválidas (diagnóstico). */
  discarded: number;
  /** ms epoch del último destroy forzado por el watchdog. */
  lastForcedAt: number;
}

const RECONNECT_MS = 5000;
const WATCHDOG_MS = 1000;
const MAX_BUFFER = 256;

/**
 * Parsea una línea del medidor: 1 a 3 dígitos decimales con valor 0..100.
 * Devuelve `null` si no es válida.
 */
export function parseFuelLine(line: string): number | null {
  const t = line.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 100 ? n : null;
}

/**
 * Monitor de nivel de combustible de los grupos electrógenos G2/G3. Cada
 * medidor es un Famil L-510 detrás de un gateway Elfin EE11 en modo TCP-SERVER
 * (no es Modbus): el equipo EMPUJA solo, cada ~300 ms, una trama ASCII `NN\r\n`
 * con el porcentaje de llenado, a 9600 baudios (el manual del fabricante dice
 * 4800: está mal). Sin checksum; sólo se abre un socket TCP y se leen líneas
 * (varios clientes pueden leer el mismo gateway, no hay problema de master
 * único).
 *
 * Sin persistencia por diseño (el nivel puede quedar meses sin cambiar) y sin
 * alertas. Difunde el estado por WebSocket (evento `fuel`) al cambiar el nivel
 * o el estado y también cada `fuelBroadcast`. Un watchdog marca `offline` al
 * dispositivo sin tramas válidas por `fuelStale` y destruye el socket para
 * forzar la reconexión (limpia sesiones fantasma del gateway).
 */
@Injectable()
export class FuelMonitorService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(FuelMonitorService.name);
  private readonly devices: FuelDeviceState[];
  private destroyed = false;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly gateway: AlertGateway,
  ) {
    const now = Date.now();
    const configs = this.config.get('fuel', { infer: true })?.devices ?? [];
    this.devices = configs.map((c) => ({
      config: c,
      socket: null,
      buffer: '',
      level: null,
      status: 'no-data' as FuelStatus,
      lastFrameAt: now,
      hasFrame: false,
      reconnectTimer: null,
      failing: false,
      discarded: 0,
      lastForcedAt: 0,
    }));
  }

  onApplicationBootstrap(): void {
    if (!this.config.get('flags', { infer: true }).acquisitionEnabled) return;
    if (this.devices.length === 0) {
      this.logger.warn('No hay medidores de combustible configurados');
      return;
    }

    const now = Date.now();
    for (const dev of this.devices) {
      dev.lastFrameAt = now;
      this.connect(dev);
    }

    const { fuelBroadcast } = this.config.get('intervals', { infer: true });
    this.addInterval('fuel-broadcast', fuelBroadcast, () => this.broadcast());
    this.addInterval('fuel-watchdog', WATCHDOG_MS, () => this.checkStale());
    this.logger.log(
      `Monitor de combustible iniciado (${this.devices.length} medidores)`,
    );
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    for (const dev of this.devices) {
      if (dev.reconnectTimer) clearTimeout(dev.reconnectTimer);
      dev.reconnectTimer = null;
      dev.socket?.destroy();
      dev.socket = null;
    }
  }

  /** Estado actual por medidor, en el orden de la configuración. */
  getSnapshot(): FuelSnapshotItem[] {
    return this.devices.map((d) => ({
      id: d.config.id,
      name: d.config.name,
      level: d.level,
      status: d.status,
      updatedAt: d.hasFrame ? new Date(d.lastFrameAt).toISOString() : null,
    }));
  }

  private label(dev: FuelDeviceState): string {
    return `Combustible ${dev.config.id.toUpperCase()}`;
  }

  private connect(dev: FuelDeviceState): void {
    if (this.destroyed) return;
    const { host, port } = dev.config;
    const socket = net.createConnection({ host, port });
    dev.socket = socket;
    dev.buffer = '';
    socket.setKeepAlive(true, 10_000);
    socket.setNoDelay(true);

    socket.on('connect', () => {
      if (dev.failing) {
        this.logger.log(`${this.label(dev)}: conexión recuperada`);
        dev.failing = false;
      }
    });
    socket.on('data', (chunk: Buffer | string) => this.handleData(dev, chunk));
    socket.on('error', (err: Error) => {
      if (!dev.failing) {
        dev.failing = true;
        this.logger.warn(
          `${this.label(dev)} (${host}:${port}): ${err.message}`,
        );
      } else {
        this.logger.debug(`${this.label(dev)}: ${err.message}`);
      }
    });
    socket.on('close', () => {
      if (dev.socket === socket) dev.socket = null;
      this.scheduleReconnect(dev);
    });
  }

  private scheduleReconnect(dev: FuelDeviceState): void {
    if (this.destroyed || dev.reconnectTimer) return;
    dev.reconnectTimer = setTimeout(() => {
      dev.reconnectTimer = null;
      this.connect(dev);
    }, RECONNECT_MS);
  }

  /** Acumula el chunk, separa por salto de línea y procesa las líneas completas. */
  private handleData(dev: FuelDeviceState, chunk: Buffer | string): void {
    dev.buffer += chunk.toString();
    const parts = dev.buffer.split('\n');
    dev.buffer = parts.pop() ?? '';
    if (dev.buffer.length > MAX_BUFFER) dev.buffer = '';
    for (const part of parts) this.handleLine(dev, part.replace(/\r/g, ''));
  }

  private handleLine(dev: FuelDeviceState, line: string): void {
    const value = parseFuelLine(line);
    if (value === null) {
      dev.discarded++;
      this.logger.debug(
        `${this.label(dev)}: trama inválida descartada (${dev.discarded})`,
      );
      return;
    }
    const prevLevel = dev.level;
    const prevStatus = dev.status;
    dev.level = value;
    dev.lastFrameAt = Date.now();
    dev.hasFrame = true;
    dev.status = 'ok';
    if (prevStatus !== 'ok') {
      this.logger.log(`${this.label(dev)}: comunicación OK`);
    }
    if (prevLevel !== value || prevStatus !== 'ok') this.broadcast();
  }

  /** Marca offline a los dispositivos sin tramas válidas y fuerza su reconexión. */
  private checkStale(): void {
    const now = Date.now();
    const { fuelStale } = this.config.get('intervals', { infer: true });
    for (const dev of this.devices) {
      if (dev.status !== 'offline') {
        if (now - dev.lastFrameAt <= fuelStale) continue;
        dev.status = 'offline';
        this.logger.warn(
          `${this.label(dev)}: sin tramas hace más de ${fuelStale} ms; offline`,
        );
        this.broadcast();
        this.forceReconnect(dev, now);
      } else if (dev.socket && now - dev.lastForcedAt >= RECONNECT_MS) {
        // Sigue offline con un socket abierto (sesión fantasma): reintentar.
        this.forceReconnect(dev, now);
      }
    }
  }

  private forceReconnect(dev: FuelDeviceState, now: number): void {
    dev.lastForcedAt = now;
    dev.socket?.destroy();
  }

  private broadcast(): void {
    this.gateway.broadcast('fuel', this.getSnapshot());
  }

  private addInterval(name: string, ms: number, fn: () => void): void {
    const handle = setInterval(fn, ms);
    this.scheduler.addInterval(name, handle);
  }
}
