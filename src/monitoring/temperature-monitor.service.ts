import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
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
@Injectable()
export class TemperatureMonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TemperatureMonitorService.name);
  private readonly states = new Map<Department, Map<string, SensorState>>();
  private readonly bindings: Record<Department, DepartmentBinding>;
  private loadedOnce = false;

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

    this.mqtt.onReading((r) => this.applyMqttReading(r));
    // Recarga inmediata cuando se edita un sensor por la API (PUT update).
    this.events.onConfigChanged(() => void this.reloadSensors());

    const intervals = this.config.get('intervals', { infer: true });
    this.addInterval('temp-modbus-poll', intervals.tempModbusPoll, () =>
      this.pollLabModbus(),
    );
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
    this.logger.log('Monitor de temperatura iniciado');
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

  private async pollLabModbus(): Promise<void> {
    const map = this.states.get('laboratorio');
    if (!map) return;
    for (const state of map.values()) {
      const addr = LAB_MODBUS_ADDRESSES[state.sensorId];
      if (addr === undefined) continue;
      try {
        const regs = await this.modbus.readHolding('temp', addr, 2);
        const value = registersToFloat(regs) - state.offset;
        state.temp =
          value > 1000 || value < -1000
            ? null
            : Number(value.toFixed(2));
      } catch {
        state.temp = null;
      }
    }
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
