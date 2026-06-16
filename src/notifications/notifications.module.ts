import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AlertGateway } from './alert.gateway';
import { EmailService } from './email.service';
import { EscalationService } from './escalation.service';
import { TelegramService } from './telegram.service';
import { WhatsappService } from './whatsapp.service';

/**
 * Canales de notificación (Telegram/WhatsApp/Email/WebSocket) y motor de
 * escalado de alertas de temperatura. Importa MonitoringModule para que el
 * escalado lea el estado de los sensores.
 *
 * Exporta los canales reutilizables por electrical/water (alarmas de borde).
 */
@Module({
  imports: [MonitoringModule],
  providers: [
    TelegramService,
    WhatsappService,
    EmailService,
    AlertGateway,
    EscalationService,
  ],
  exports: [TelegramService, WhatsappService, AlertGateway],
})
export class NotificationsModule {}
