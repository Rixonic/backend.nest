import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import * as mqtt from 'mqtt';
import { AppConfig } from '../../config/configuration';

export interface MqttReading {
  source: 'farmacia' | 'sistemas';
  sensorId: string;
  /** Temperatura, o `null` si el sensor reportó desconexión (-127). */
  temp: number | null;
}

export const MQTT_READING_EVENT = 'reading';

/**
 * Cliente MQTT que se suscribe a los topics de temperatura de farmacia y
 * sistemas, parsea `topic -> sensorId` y `payload -> temp`, y emite un evento
 * `reading` ({@link MqttReading}) por cada mensaje. Los monitores se suscriben
 * vía {@link onReading}.
 */
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private readonly emitter = new EventEmitter();
  private client?: mqtt.MqttClient;
  /** prefijo de topic (sin `#`) -> fuente */
  private readonly routes: { prefix: string; source: MqttReading['source'] }[] =
    [];

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    if (!this.config.get('flags', { infer: true }).acquisitionEnabled) {
      this.logger.warn('Adquisición deshabilitada (ACQUISITION_ENABLED=false)');
      return;
    }
    const mqttCfg = this.config.get('mqtt', { infer: true });
    this.routes.push(
      { prefix: stripWildcard(mqttCfg.topics.farmacia), source: 'farmacia' },
      { prefix: stripWildcard(mqttCfg.topics.sistemas), source: 'sistemas' },
    );

    this.client = mqtt.connect(mqttCfg.url, { reconnectPeriod: 5000 });

    this.client.on('connect', () => {
      this.logger.log(`Conectado a MQTT ${mqttCfg.url}`);
      this.client!.subscribe(
        [mqttCfg.topics.farmacia, mqttCfg.topics.sistemas],
        { qos: 2 },
        (err) => {
          if (err) this.logger.error(`Error al suscribir: ${err.message}`);
        },
      );
    });

    this.client.on('error', (err: NodeJS.ErrnoException) =>
      this.logger.warn(
        `MQTT no disponible (${err.code ?? err.message ?? err}); reintentando`,
      ),
    );
    this.client.on('message', (topic, payload) =>
      this.handleMessage(topic, payload),
    );
  }

  onModuleDestroy(): void {
    this.client?.end(true);
  }

  /** Registra un handler que recibe cada lectura MQTT. */
  onReading(handler: (reading: MqttReading) => void): void {
    this.emitter.on(MQTT_READING_EVENT, handler);
  }

  private handleMessage(topic: string, payload: Buffer): void {
    const route = this.routes.find((r) => topic.startsWith(r.prefix));
    if (!route) return;

    const sensorId = topic.substring(topic.lastIndexOf('/') + 1);
    if (!sensorId) return;

    const raw = Number(payload.toString());
    const temp = !Number.isFinite(raw) || raw === -127 ? null : raw;

    this.emitter.emit(MQTT_READING_EVENT, {
      source: route.source,
      sensorId,
      temp,
    } as MqttReading);
  }
}

/** Quita el sufijo de wildcard MQTT (`/#` o `#`) para obtener el prefijo base. */
function stripWildcard(topic: string): string {
  return topic.replace(/#$/, '').replace(/\/$/, '/');
}
