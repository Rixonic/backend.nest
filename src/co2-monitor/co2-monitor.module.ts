import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { Co2Module } from '../services/co2/co2.module';
import { Co2MonitorService } from './co2-monitor.service';

/**
 * Monitoreo de presión de CO2 (Ramos Mejía). Importa la capa de persistencia
 * (sensores + lecturas) y las notificaciones (gateway WebSocket); la
 * adquisición Modbus es global.
 */
@Module({
  imports: [Co2Module, NotificationsModule],
  providers: [Co2MonitorService],
  exports: [Co2MonitorService],
})
export class Co2MonitorModule {}
