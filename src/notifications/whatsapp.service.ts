import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

/**
 * Envío de notificaciones por WhatsApp vía la Graph API de Meta, usando la
 * plantilla `notificacion_bms` (es_AR). Migrado de los nodos "WhatsApp" de
 * Node-RED. Usa `fetch` nativo (Node 20+).
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async send(message: string, to?: string): Promise<void> {
    if (!this.config.get('flags', { infer: true }).alertsEnabled) return;
    const wa = this.config.get('channels', { infer: true }).whatsapp;
    if (!wa.token) {
      this.logger.warn('WHATSAPP_TOKEN ausente: WhatsApp deshabilitado');
      return;
    }
    const destination = to ?? wa.defaultTo;
    try {
      const res = await fetch(
        `https://graph.facebook.com/v22.0/${wa.phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${wa.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: destination,
            type: 'template',
            template: {
              name: 'notificacion_bms',
              language: { code: 'es_AR' },
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: message }],
                },
              ],
            },
          }),
        },
      );
      if (!res.ok) {
        this.logger.error(
          `WhatsApp ${res.status}: ${await res.text()}`,
        );
      }
    } catch (err) {
      this.logger.error(`WhatsApp error: ${(err as Error).message}`);
    }
  }
}
