import { Global, Module } from '@nestjs/common';
import { SensorEventBus } from './sensor-events.service';

/**
 * Bus de eventos global. Lo importan implícitamente todos los módulos (los
 * servicios de departamento para emitir, el monitor para suscribirse).
 */
@Global()
@Module({
  providers: [SensorEventBus],
  exports: [SensorEventBus],
})
export class EventsModule {}
