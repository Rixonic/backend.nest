import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FuelMonitorService } from './fuel-monitor.service';

/**
 * Monitoreo del nivel de combustible de los grupos electrógenos G2/G3. Sólo
 * necesita el gateway WebSocket (vía `NotificationsModule`); no persiste ni
 * alerta.
 */
@Module({
  imports: [NotificationsModule],
  providers: [FuelMonitorService],
  exports: [FuelMonitorService],
})
export class FuelMonitorModule {}
