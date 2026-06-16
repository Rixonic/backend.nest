import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransferMonitorService } from './transfer-monitor.service';

/**
 * Monitoreo de los PLC de transferencia eléctrica (Ramos Mejía + Castelar).
 * Usa la adquisición Modbus (global) y los canales de notificación.
 */
@Module({
  imports: [NotificationsModule],
  providers: [TransferMonitorService],
  exports: [TransferMonitorService],
})
export class ElectricalModule {}
