import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

/**
 * Bus de eventos en proceso para desacoplar la edición de sensores (controllers
 * de departamento) de la recarga del estado en memoria (TemperatureMonitor).
 *
 * Evita una dependencia circular: los servicios de departamento emiten
 * `config-changed` tras un update y el monitor se suscribe, sin que ninguno
 * conozca al otro.
 */
@Injectable()
export class SensorEventBus {
  private static readonly EVENT = 'config-changed';
  private readonly emitter = new EventEmitter();

  /** Notifica que la configuración de algún sensor cambió (p.ej. tras un PUT). */
  emitConfigChanged(): void {
    this.emitter.emit(SensorEventBus.EVENT);
  }

  /** Suscribe un handler que se ejecuta cuando cambia la config de sensores. */
  onConfigChanged(handler: () => void): void {
    this.emitter.on(SensorEventBus.EVENT, handler);
  }
}
