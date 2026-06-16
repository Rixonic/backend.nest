import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/configuration';
import { ModbusService } from '../acquisition/modbus/modbus.service';
import { AlertGateway } from '../notifications/alert.gateway';
import { TelegramService } from '../notifications/telegram.service';
import {
  OxygenSensorService,
  OxygenReadingsService,
} from '../services/oxigeno/oxigeno.service';

interface OxygenState {
  id: number;
  sensorId: string;
  name: string;
  offset: number;
  /** Dirección del input register (FC4); se asigna por orden de id. */
  address: number;
  pressure: number | null;
  alertSent: boolean;
}

const DEVICE = 'oxigeno';
/** Escala del registro crudo: presión = raw / 100 - offset. */
const SCALE = 100;
/** Umbral de baja presión que dispara la alerta. */
const LOW_THRESHOLD = 20;
/** La alerta se reestablece cuando la presión vuelve a superar este valor. */
const RESET_THRESHOLD = 100;

/**
 * Monitor de presión de oxígeno. Lee dos sensores por Modbus TCP (input
 * registers FC4 desde la dirección 0), aplica `presión = raw / 100 - offset`,
 * difunde ambas presiones por WebSocket (evento `pressure`) en cada muestreo y
 * persiste en `oxigeno.historic` cada `oxygenPersist`. Alerta por Telegram en
 * el flanco de baja presión (< 20), reseteando al recuperarse (> 100). Sin
 * WhatsApp. Misma estructura que `WaterMonitorService`.
 */
@Injectable()
export class OxygenMonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OxygenMonitorService.name);
  private states: OxygenState[] = [];

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly modbus: ModbusService,
    private readonly telegram: TelegramService,
    private readonly gateway: AlertGateway,
    private readonly sensors: OxygenSensorService,
    private readonly readings: OxygenReadingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('flags', { infer: true }).acquisitionEnabled) return;

    await this.loadSensors();
    if (this.states.length === 0) {
      this.logger.warn(
        'No hay sensores de oxígeno configurados; monitor inactivo',
      );
      return;
    }

    const intervals = this.config.get('intervals', { infer: true });
    this.addInterval('oxygen-poll', intervals.oxygenPoll, () =>
      void this.poll(),
    );
    this.addInterval('oxygen-persist', intervals.oxygenPersist, () =>
      void this.persist(),
    );
    this.logger.log(
      `Monitor de oxígeno iniciado (${this.states.length} sensores)`,
    );
  }

  /** Última presión leída por sensor (para el snapshot REST y el WebSocket). */
  getSnapshot(): { sensorId: string; name: string; pressure: number | null }[] {
    return this.states.map((s) => ({
      sensorId: s.sensorId,
      name: s.name,
      pressure: s.pressure,
    }));
  }

  /**
   * Carga los sensores desde la BD y los ordena por id ascendente: el de menor
   * id queda en la dirección Modbus 0, el siguiente en la 1, etc.
   */
  private async loadSensors(): Promise<void> {
    try {
      const rows = await this.sensors.findAll();
      this.states = rows
        .sort((a, b) => a.id - b.id)
        .map((s, index) => ({
          id: s.id,
          sensorId: s.sensorId,
          name: s.name,
          offset: Number(s.offset),
          address: index,
          pressure: null,
          alertSent: false,
        }));
    } catch (err) {
      this.logger.error(
        `No se pudieron cargar sensores de oxígeno: ${(err as Error).message}`,
      );
    }
  }

  private async poll(): Promise<void> {
    let regs: number[];
    try {
      regs = await this.modbus.readInput(DEVICE, 0, this.states.length);
    } catch {
      return;
    }

    for (const state of this.states) {
      const raw = regs[state.address];
      if (raw === undefined) continue;
      const pressure = Number((raw / SCALE - state.offset).toFixed(2));
      state.pressure = pressure;
      this.checkAlert(state, pressure);
    }

    this.gateway.broadcast('pressure', this.getSnapshot());
  }

  private checkAlert(state: OxygenState, pressure: number): void {
    if (pressure < LOW_THRESHOLD && !state.alertSent) {
      const chatId = this.config.get('channels', { infer: true }).sites.ramos
        .telegramChatId;
      void this.telegram.sendMessage(
        chatId,
        `Baja presión de oxígeno en ${state.name}: ${pressure}`,
      );
      state.alertSent = true;
    } else if (pressure > RESET_THRESHOLD && state.alertSent) {
      state.alertSent = false;
    }
  }

  private async persist(): Promise<void> {
    const rows = this.states
      .filter((s) => s.pressure !== null)
      .map((s) => ({ id: s.id, pressure: s.pressure as number }));
    if (rows.length === 0) return;
    try {
      await this.readings.createMany(rows);
    } catch (err) {
      this.logger.error(
        `Error al persistir presiones de oxígeno: ${(err as Error).message}`,
      );
    }
  }

  private addInterval(name: string, ms: number, fn: () => void): void {
    const handle = setInterval(fn, ms);
    this.scheduler.addInterval(name, handle);
  }
}
