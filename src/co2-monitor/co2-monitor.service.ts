import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/configuration';
import { ModbusService } from '../acquisition/modbus/modbus.service';
import { AlertGateway } from '../notifications/alert.gateway';
import {
  Co2SensorService,
  Co2ReadingsService,
} from '../services/co2/co2.service';

export type Co2Status =
  | 'ok'
  | 'open-loop'
  | 'over-range'
  | 'adc-error'
  | 'no-data';

interface Co2State {
  id: number;
  sensorId: string;
  name: string;
  offset: number;
  /** Canal (0 o 1): define el registro de valor, corriente y estado de lazo. */
  channel: number;
  pressure: number | null;
  /** Corriente del lazo 4-20 mA. */
  current: number | null;
  status: Co2Status;
  alertSent: boolean;
}

const DEVICE = 'co2';
/** Cantidad de input registers (FC4) del dispositivo; se leen SIEMPRE en un solo bloque. */
const REG_COUNT = 11;
/** Registro de estado del ADS: 1 OK, 0 no disponible. */
const REG_ADS = 6;
/** Escala del registro crudo: presión (bar) = raw / 100 - offset; corriente (mA) = raw / 100. */
const SCALE = 100;
/** Umbral de baja presión que dispara la alerta (bar). */
const LOW_THRESHOLD = 8;
/** La alerta se reestablece (cilindro repuesto) cuando la presión supera este valor (bar). */
const RESET_THRESHOLD = 15;
const MAX_CHANNELS = 2;

/**
 * Monitor de presión de CO2 (Ramos Mejía, dos baterías de cilindros). Lee un
 * Arduino Modbus TCP con UN solo request FC4 de 11 registros (el equipo es
 * frágil: nunca registro por registro). Un canal es válido sólo si el ADS está
 * OK (reg 6 = 1) y su estado de lazo es 0; si no, presión `null` y un estado de
 * falla. Difunde por WebSocket (evento `co2`) en cada muestreo y persiste en
 * `co2.historic` cada `co2Persist`. La alerta de baja presión (< 8 bar, se rearma
 * > 15) se loguea y, si hay `co2.alertWebhookUrl`, se envía por POST a ese
 * webhook (grupo de WhatsApp gestionado por una app externa). Sin Telegram.
 */
@Injectable()
export class Co2MonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(Co2MonitorService.name);
  private states: Co2State[] = [];

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly modbus: ModbusService,
    private readonly gateway: AlertGateway,
    private readonly sensors: Co2SensorService,
    private readonly readings: Co2ReadingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('flags', { infer: true }).acquisitionEnabled) return;

    await this.loadSensors();
    if (this.states.length === 0) {
      this.logger.warn('No hay sensores de CO2 configurados; monitor inactivo');
      return;
    }

    const intervals = this.config.get('intervals', { infer: true });
    this.addInterval('co2-poll', intervals.co2Poll, () => void this.poll());
    this.addInterval(
      'co2-persist',
      intervals.co2Persist,
      () => void this.persist(),
    );
    this.logger.log(
      `Monitor de CO2 iniciado (${this.states.length} sensores)`,
    );
  }

  /** Última lectura por sensor (para el snapshot REST y el WebSocket). */
  getSnapshot(): {
    sensorId: string;
    name: string;
    pressure: number | null;
    current: number | null;
    status: string;
  }[] {
    return this.states.map((s) => ({
      sensorId: s.sensorId,
      name: s.name,
      pressure: s.pressure,
      current: s.current,
      status: s.status,
    }));
  }

  /**
   * Carga los sensores desde la BD y los ordena por id ascendente: el de menor
   * id queda en el canal 1 (reg 0), el siguiente en el canal 2 (reg 1).
   */
  private async loadSensors(): Promise<void> {
    try {
      const rows = (await this.sensors.findAll()).sort((a, b) => a.id - b.id);
      if (rows.length > MAX_CHANNELS) {
        this.logger.warn(
          `Hay ${rows.length} sensores de CO2 pero el equipo tiene ${MAX_CHANNELS} canales; se ignoran los extras`,
        );
      }
      this.states = rows.slice(0, MAX_CHANNELS).map((s, index) => ({
        id: s.id,
        sensorId: s.sensorId,
        name: s.name,
        offset: Number(s.offset),
        channel: index,
        pressure: null,
        current: null,
        status: 'no-data',
        alertSent: false,
      }));
    } catch (err) {
      this.logger.error(
        `No se pudieron cargar sensores de CO2: ${(err as Error).message}`,
      );
    }
  }

  private async poll(): Promise<void> {
    let regs: number[];
    try {
      regs = await this.modbus.readInput(DEVICE, 0, REG_COUNT);
    } catch {
      return;
    }
    if (!regs || regs.length < REG_COUNT) return;

    const adsOk = regs[REG_ADS] === 1;
    for (const state of this.states) {
      const raw = regs[state.channel];
      const currentRaw = regs[7 + state.channel];
      const loop = regs[9 + state.channel];

      let status: Co2Status;
      if (!adsOk) status = 'adc-error';
      else if (loop === 1) status = 'open-loop';
      else if (loop === 2) status = 'over-range';
      else if (loop === 0) status = 'ok';
      else status = 'adc-error';

      state.current = Number((currentRaw / SCALE).toFixed(2));
      state.pressure =
        status === 'ok' ? Number((raw / SCALE - state.offset).toFixed(2)) : null;

      if (status !== state.status) {
        this.logger.warn(
          `CO2 ${state.name}: estado ${state.status} -> ${status}`,
        );
        state.status = status;
      }

      if (state.pressure !== null) this.checkAlert(state, state.pressure);
    }

    this.gateway.broadcast('co2', this.getSnapshot());
  }

  private checkAlert(state: Co2State, pressure: number): void {
    if (pressure < LOW_THRESHOLD && !state.alertSent) {
      state.alertSent = true;
      this.logger.warn(
        `Baja presión de CO2 en ${state.name}: ${pressure} bar (< ${LOW_THRESHOLD})`,
      );
      void this.sendWebhook(state, pressure);
    } else if (pressure > RESET_THRESHOLD && state.alertSent) {
      state.alertSent = false;
    }
  }

  /** POST al webhook externo (si está configurado); nunca lanza. */
  private async sendWebhook(state: Co2State, pressure: number): Promise<void> {
    try {
      const url = this.config.get('co2', { infer: true }).alertWebhookUrl;
      if (!url) return;
      if (!this.config.get('flags', { infer: true }).alertsEnabled) return;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'co2-low-pressure',
          site: 'ramos',
          sensorId: state.sensorId,
          name: state.name,
          pressure,
          threshold: LOW_THRESHOLD,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.error(`Webhook de CO2 respondió HTTP ${res.status}`);
      }
    } catch (err) {
      this.logger.error(
        `Error al enviar webhook de CO2: ${(err as Error).message}`,
      );
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
        `Error al persistir presiones de CO2: ${(err as Error).message}`,
      );
    }
  }

  private addInterval(name: string, ms: number, fn: () => void): void {
    const handle = setInterval(fn, ms);
    this.scheduler.addInterval(name, handle);
  }
}
