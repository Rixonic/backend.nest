import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OxygenModule } from '../services/oxigeno/oxigeno.module';
import { OxygenMonitorService } from './oxygen-monitor.service';

/**
 * Monitoreo de presión de oxígeno. Importa la capa de persistencia (sensores +
 * lecturas) y los canales de notificación; la adquisición Modbus es global.
 */
@Module({
  imports: [OxygenModule, NotificationsModule],
  providers: [OxygenMonitorService],
  exports: [OxygenMonitorService],
})
export class OxygenMonitorModule {}
