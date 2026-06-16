import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../config/configuration';

/**
 * Envío de emails por SMTP (Office365). Migrado de los nodos "e-mail" de
 * Node-RED. Sin credenciales SMTP queda deshabilitado.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: nodemailer.Transporter;
  private from = '';

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    if (!this.config.get('flags', { infer: true }).alertsEnabled) return;
    const smtp = this.config.get('channels', { infer: true }).smtp;
    if (!smtp.user || !smtp.pass) {
      this.logger.warn('SMTP sin credenciales: email deshabilitado');
      return;
    }
    this.from = smtp.from;
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
  }

  async send(to: string | string[], subject: string, text: string): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
    } catch (err) {
      this.logger.error(`email a ${to}: ${(err as Error).message}`);
    }
  }
}
