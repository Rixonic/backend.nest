import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WaterModule } from '../services/agua/agua.module';
import { WaterMonitorService } from './water-monitor.service';

/**
 * Monitoreo de nivel de tanque/cisterna. Importa el módulo de agua (servicios de
 * persistencia) y los canales de notificación; la adquisición Modbus es global.
 */
@Module({
  imports: [WaterModule, NotificationsModule],
  providers: [WaterMonitorService],
  exports: [WaterMonitorService],
})
export class WaterMonitorModule {}
