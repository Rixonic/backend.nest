import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/configuration';
import { ModbusService } from '../acquisition/modbus/modbus.service';
import { MqttService, MqttReading } from '../acquisition/mqtt/mqtt.service';
import { registersToFloat } from '../acquisition/modbus/modbus.util';
import { LAB_MODBUS_ADDRESSES } from './lab-modbus.map';
import { Department, SensorState } from './sensor-state';
import { Sensor } from '../sensors/sensor.entity';
import { SensorEventBus } from '../events/sensor-events.service';

import { SensorService as LabSensorService } from '../services/laboratorio/laboratory.service';
import { SensorReadingsService as LabReadingsService } from '../services/laboratorio/laboratory.service';
import { SensorService as FarmacySensorService } from '../services/farmacia/farmacy.service';
import { SensorReadingsService as FarmacyReadingsService } from '../services/farmacia/farmacy.service';
import { SensorService as SystemSensorService } from '../services/sistemas/system.service';
import { SensorReadingsService as SystemReadingsService } from '../services/sistemas/system.service';

interface DepartmentBinding {
  sensors: { findAll(): Promise<Sensor[]> };
  readings: { createMany(dto: { id: number; temp: number }[]): Promise<string> };
  source: 'modbus' | 'mqtt';
}

/**
 * Monitor de temperatura unificado para laboratorio (Modbus), farmacia y
 * sistemas (MQTT). Mantiene el estado de cada sensor en memoria, evalúa el
 * umbral con debounce y persiste lecturas periódicamente. Reemplaza los nodos
 * "Read Temp" / "Process/Temp" / "Refresh Temp" y los POST de Node-RED.
 *
 * El estado de alerta es consumido por `EscalationService` para notificar.
 */
/** Cadencia del log de métricas Modbus del laboratorio (ms). */
const METRICS_LOG_MS = 60_000;

@Injectable()
export class TemperatureMonitorService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TemperatureMonitorService.name);
  private readonly states = new Map<Department, Map<string, SensorState>>();
  private readonly bindings: Record<Department, DepartmentBinding>;
  private loadedOnce = false;

  /** Controla el loop de lectura Modbus (false en shutdown). */
  private running = false;
  /** Dirección base y cantidad del bloque de registros del laboratorio. */
  private labBase = 0;
  private labQuantity = 0;
  /** Acumuladores de duración de ciclo (se reinician en cada log de métricas). */
  private cycleCount = 0;
  private cycleMsTotal = 0;
  private cycleMsMax = 0;
  /** Último snapshot de métricas del PLC para calcular deltas por minuto. */
  private lastMetrics = { ops: 0, errors: 0, timeouts: 0, reconnects: 0 };

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly modbus: ModbusService,
    private readonly mqtt: MqttService,
    private readonly events: SensorEventBus,
    labSensors: LabSensorService,
    labReadings: LabReadingsService,
    farmacySensors: FarmacySensorService,
    farmacyReadings: FarmacyReadingsService,
    systemSensors: SystemSensorService,
    systemReadings: SystemReadingsService,
  ) {
    this.bindings = {
      laboratorio: { sensors: labSensors, readings: labReadings, source: 'modbus' },
      farmacia: { sensors: farmacySensors, readings: farmacyReadings, source: 'mqtt' },
      sistemas: { sensors: systemSensors, readings: systemReadings, source: 'mqtt' },
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('flags', { infer: true }).acquisitionEnabled) return;

    await this.reloadSensors();

    // Rango del bloque de registros del laboratorio: leemos de la dirección más
    // baja a la más alta en UNA sola transacción Modbus por ciclo (como hacía
    // Node-RED), en vez de una lectura por sensor.
    const labAddrs = Object.values(LAB_MODBUS_ADDRESSES);
    if (labAddrs.length > 0) {
      this.labBase = Math.min(...labAddrs);
      this.labQuantity = Math.max(...labAddrs) + 2 - this.labBase;
    }

    this.mqtt.onReading((r) => this.applyMqttReading(r));
    // Recarga inmediata cuando se edita un sensor por la API (PUT update).
    this.events.onConfigChanged(() => void this.reloadSensors());

    const intervals = this.config.get('intervals', { infer: true });
    this.addInterval('temp-monitor-tick', intervals.monitorTick, () =>
      this.evaluate(),
    );
    this.addInterval('temp-readings-persist', intervals.readingsPersist, () =>
      this.persist(),
    );
    // Recarga periódica de la config (max/min/time/offset) para que las ediciones
    // por PUT /sensor/update impacten el alerteo en vivo sin reiniciar.
    this.addInterval('temp-config-reload', intervals.sensorReload, () => {
      void this.reloadSensors();
    });
    this.addInterval('temp-modbus-metrics', METRICS_LOG_MS, () =>
      this.logMetrics(),
    );

    // Lectura Modbus del laboratorio: loop secuencial (nunca solapa ciclos) con
    // backoff ante error, en lugar de setInterval (que podría apilar lecturas si
    // el PLC tarda). Reemplaza al ex `temp-modbus-poll`.
    this.running = true;
    void this.runLabModbusLoop();

    this.logger.log('Monitor de temperatura iniciado');
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  /** Estados de un departamento (consumido por la capa de notificaciones). */
  getStates(dept: Department): SensorState[] {
    return [...(this.states.get(dept)?.values() ?? [])];
  }

  /** Snapshot de todos los departamentos, para difundir por WebSocket/diagnóstico. */
  getSnapshot(): Record<Department, SensorState[]> {
    return {
      laboratorio: this.getStates('laboratorio'),
      farmacia: this.getStates('farmacia'),
      sistemas: this.getStates('sistemas'),
    };
  }

  /** (Re)carga la configuración de sensores desde la BD para cada departamento. */
  async reloadSensors(): Promise<void> {
    for (const dept of Object.keys(this.bindings) as Department[]) {
      try {
        const binding = this.bindings[dept];
        const sensors = await binding.sensors.findAll();
        const map = this.states.get(dept) ?? new Map<string, SensorState>();
        for (const s of sensors) {
          const existing = map.get(s.sensorId);
          map.set(s.sensorId, {
            id: s.id,
            sensorId: s.sensorId,
            name: s.name,
            labId: s.labId,
            location: s.location,
            type: s.type,
            max: Number(s.max),
            min: Number(s.min),
            time: Number(s.time),
            offset: Number(s.offset),
            source: binding.source,
            // preserva runtime si ya existía
            temp: existing?.temp ?? null,
            alert: existing?.alert ?? false,
            debounce: existing?.debounce ?? Number(s.time),
            disconnectTicks: existing?.disconnectTicks ?? 0,
          });
        }
        this.states.set(dept, map);
        const msg = `${dept}: ${map.size} sensores cargados`;
        if (this.loadedOnce) this.logger.debug(msg);
        else this.logger.log(msg);
      } catch (err) {
        this.logger.error(
          `No se pudo cargar sensores de ${dept}: ${(err as Error).message}`,
        );
      }
    }
    this.loadedOnce = true;
  }

  private applyMqttReading(reading: MqttReading): void {
    const map = this.states.get(reading.source);
    const state = map?.get(reading.sensorId);
    if (!state) return;
    state.temp = reading.temp;
    state.disconnectTicks = this.config.get('intervals', {
      infer: true,
    }).mqttDisconnectTicks;
  }

  /**
   * Loop de lectura del PLC de temperaturas (AC500). Secuencial y sin solape:
   * lee → mide → espera. Ante un ciclo fallido espera `tempModbusBackoff` para
   * no generar ráfagas de reconexión contra el PLC.
   */
  private async runLabModbusLoop(): Promise<void> {
    while (this.running) {
      const intervals = this.config.get('intervals', { infer: true });
      const t0 = Date.now();
      let ok = true;
      try {
        await this.pollLabModbus();
      } catch (err) {
        ok = false;
        this.logger.debug(`Ciclo Modbus lab fallido: ${(err as Error).message}`);
      }
      const elapsed = Date.now() - t0;
      this.cycleCount += 1;
      this.cycleMsTotal += elapsed;
      if (elapsed > this.cycleMsMax) this.cycleMsMax = elapsed;

      await this.sleep(ok ? intervals.tempModbusPoll : intervals.tempModbusBackoff);
    }
  }

  /**
   * Lee TODO el bloque de registros del laboratorio en una sola transacción y
   * reparte los pares (palabra alta/baja) a cada sensor. Lanza si la lectura
   * falla, para que el loop aplique backoff.
   */
  private async pollLabModbus(): Promise<void> {
    const map = this.states.get('laboratorio');
    if (!map || this.labQuantity === 0) return;

    let block: number[];
    try {
      block = await this.modbus.readHolding('temp', this.labBase, this.labQuantity);
    } catch (err) {
      // Sin lectura: marcamos los sensores del lab como desconectados y
      // propagamos para que el loop espere (backoff).
      for (const state of map.values()) {
        if (LAB_MODBUS_ADDRESSES[state.sensorId] !== undefined) state.temp = null;
      }
      throw err;
    }

    for (const state of map.values()) {
      const addr = LAB_MODBUS_ADDRESSES[state.sensorId];
      if (addr === undefined) continue;
      const i = addr - this.labBase;
      const hi = block[i];
      const lo = block[i + 1];
      if (hi === undefined || lo === undefined) {
        state.temp = null;
        continue;
      }
      const value = registersToFloat([hi, lo]) - state.offset;
      state.temp = value > 1000 || value < -1000 ? null : Number(value.toFixed(2));
    }
  }

  /** Loguea duración de ciclo y ops/min contra el PLC (corre cada `METRICS_LOG_MS`). */
  private logMetrics(): void {
    const m = this.modbus.getMetrics('temp') ?? this.lastMetrics;
    const d = {
      ops: m.ops - this.lastMetrics.ops,
      errors: m.errors - this.lastMetrics.errors,
      timeouts: m.timeouts - this.lastMetrics.timeouts,
      reconnects: m.reconnects - this.lastMetrics.reconnects,
    };
    this.lastMetrics = { ...m };
    const avg = this.cycleCount
      ? Math.round(this.cycleMsTotal / this.cycleCount)
      : 0;
    this.logger.log(
      `Modbus lab (temp): ${this.cycleCount} ciclos, ciclo avg ${avg}ms / max ` +
        `${this.cycleMsMax}ms; PLC: ${d.ops} ops/min, ${d.errors} errores, ` +
        `${d.timeouts} timeouts, ${d.reconnects} reconexiones`,
    );
    this.cycleCount = 0;
    this.cycleMsTotal = 0;
    this.cycleMsMax = 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Evalúa umbral + debounce para todos los sensores. Corre cada `monitorTick`. */
  private evaluate(): void {
    for (const map of this.states.values()) {
      for (const state of map.values()) {
        if (state.source === 'mqtt' && state.disconnectTicks > 0) {
          state.disconnectTicks -= 1;
          if (state.disconnectTicks === 0) state.temp = null;
        }

        const outOfRange =
          state.temp === null ||
          state.temp > state.max ||
          state.temp < state.min;

        if (outOfRange) {
          if (state.debounce > 0) state.debounce -= 1;
          else state.alert = true;
        } else {
          state.alert = false;
          state.debounce = state.time;
        }
      }
    }
  }

  private async persist(): Promise<void> {
    for (const dept of Object.keys(this.bindings) as Department[]) {
      const states = this.getStates(dept);
      const rows = states
        .filter((s) => s.temp !== null)
        .map((s) => ({ id: s.id, temp: s.temp as number }));
      if (rows.length === 0) continue;
      try {
        await this.bindings[dept].readings.createMany(rows);
      } catch (err) {
        this.logger.error(
          `Error al persistir lecturas de ${dept}: ${(err as Error).message}`,
        );
      }
    }
  }

  private addInterval(name: string, ms: number, fn: () => void): void {
    const handle = setInterval(fn, ms);
    this.scheduler.addInterval(name, handle);
  }
}
