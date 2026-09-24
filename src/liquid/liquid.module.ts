import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OxygenModule } from '../services/oxigeno/oxigeno.module';
import { LiquidController } from './liquid.controller';
import { LiquidMonitorService } from './liquid-monitor.service';

/**
 * Nivel del tanque de oxígeno líquido por cámara (lectura del LCD Linde
 * Hawkeye). Importa la persistencia de oxígeno y el gateway WebSocket.
 */
@Module({
  imports: [OxygenModule, NotificationsModule],
  providers: [LiquidMonitorService],
  controllers: [LiquidController],
  exports: [LiquidMonitorService],
})
export class LiquidMonitorModule {}
