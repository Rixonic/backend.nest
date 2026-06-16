import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/configuration';
import {
  AlertRecipient,
  RECIPIENTS,
  temperatureAlertMessage,
} from '../config/recipients.config';
import { Department, SensorState } from '../monitoring/sensor-state';
import { TemperatureMonitorService } from '../monitoring/temperature-monitor.service';
import { AlertGateway } from './alert.gateway';
import { AlertCallbackData, TelegramService } from './telegram.service';
import { EmailService } from './email.service';

interface MessageControl {
  /** ms restantes hasta el próximo (re)envío. */
  timer: number;
  /** Nivel de escalado actual. */
  groupIndex: number;
  isCanceled: boolean;
}

/**
 * Motor de escalado de alertas de temperatura. Replica los nodos "Message
 * Handle" + "Response Callback" de Node-RED: consume el estado `alert` del
 * monitor y, mientras una alarma siga activa y no haya sido cancelada, notifica
 * al grupo del nivel actual, escala al siguiente nivel y reenvía cada
 * `escalation.resendInterval`.
 *
 * También difunde el snapshot de temperatura por WebSocket en cada tick.
 */
@Injectable()
export class EscalationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EscalationService.name);
  private readonly controls = new Map<string, MessageControl>();

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly monitor: TemperatureMonitorService,
    private readonly telegram: TelegramService,
    private readonly email: EmailService,
    private readonly gateway: AlertGateway,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('flags', { infer: true }).alertsEnabled) return;

    this.telegram.onCallbackData((data, chatId) =>
      this.handleCallback(data, chatId),
    );

    const tick = this.config.get('intervals', { infer: true }).monitorTick;
    const handle = setInterval(() => this.tick(tick), tick);
    this.scheduler.addInterval('escalation-tick', handle);
    this.logger.log('Motor de escalado iniciado');
  }

  private tick(elapsedMs: number): void {
    for (const dept of Object.keys(RECIPIENTS) as Department[]) {
      const states = this.monitor.getStates(dept);
      for (const state of states) {
        this.processSensor(dept, state, elapsedMs);
      }
      this.gateway.broadcast('temperature', { dept, states });
    }
  }

  private processSensor(
    dept: Department,
    state: SensorState,
    elapsedMs: number,
  ): void {
    const key = `${dept}:${state.sensorId}`;
    let mc = this.controls.get(key);
    if (!mc) {
      mc = { timer: 0, groupIndex: 0, isCanceled: false };
      this.controls.set(key, mc);
    }

    if (state.alert && !mc.isCanceled) {
      if (mc.timer <= 0) {
        const groups = RECIPIENTS[dept].groups;
        void this.notifyGroup(dept, state, groups[mc.groupIndex]);
        if (mc.groupIndex < groups.length - 1) mc.groupIndex += 1;
        mc.timer = this.config.get('escalation', { infer: true }).resendInterval;
      } else {
        mc.timer -= elapsedMs;
      }
    } else if (!state.alert) {
      mc.timer = 0;
      mc.groupIndex = 0;
      mc.isCanceled = false;
    }
  }

  private async notifyGroup(
    dept: Department,
    state: SensorState,
    group: AlertRecipient[],
  ): Promise<void> {
    const hour = new Date().getHours();
    const text = temperatureAlertMessage(state);
    const deptCfg = RECIPIENTS[dept];
    let emailSent = false;

    for (const user of group) {
      if (hour < user.workingHours[0] || hour > user.workingHours[1]) continue;
      await this.telegram.sendAlert(
        user.chatId,
        text,
        state.sensorId,
        user.admin,
      );
      // Los destinatarios no-admin también disparan los emails del departamento.
      if (!user.admin && !emailSent && deptCfg.emails.length > 0) {
        await this.email.send(deptCfg.emails, deptCfg.emailSubject, text);
        emailSent = true;
      }
    }
  }

  private handleCallback(
    data: AlertCallbackData,
    chatId: number | string,
  ): void {
    for (const [key, mc] of this.controls) {
      if (!key.endsWith(`:${data.sensorId}`)) continue;
      if (data.received) {
        mc.timer = this.config.get('escalation', {
          infer: true,
        }).ackExtendInterval;
        mc.isCanceled = false;
        void this.telegram.sendMessage(chatId, 'Confirmacion recibida');
      }
      if (data.canceled) {
        mc.isCanceled = true;
        void this.telegram.sendMessage(chatId, 'Alarma cancelada');
      }
    }
  }
}
