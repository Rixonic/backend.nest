import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/configuration';
import { ModbusService } from '../acquisition/modbus/modbus.service';
import { registersToScaled } from '../acquisition/modbus/modbus.util';
import { AlertGateway } from '../notifications/alert.gateway';
import { TelegramService } from '../notifications/telegram.service';
import { WhatsappService } from '../notifications/whatsapp.service';
import {
  TanqueReadingsService,
  CisternaReadingsService,
} from '../services/agua/agua.service';

interface TankConfig {
  name: string;
  device: 'tanque' | 'cisterna';
  lowMessage: string;
  notifyWhatsapp: boolean;
  persist: (level: number) => Promise<string>;
}

const LOW_THRESHOLD = 0.5;
const RESET_THRESHOLD = 0.55;

/**
 * Monitor de nivel de tanque y cisterna. Lee el nivel por Modbus
 * (`level = raw / 10^decimales`), persiste la lectura y alerta por
 * Telegram/WhatsApp en el flanco de bajo nivel (< 0.5), reseteando al
 * recuperarse (>= 0.55). Reemplaza los nodos "function 3/4" de Node-RED.
 */
@Injectable()
export class WaterMonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WaterMonitorService.name);
  private readonly alertSent = new Map<string, boolean>();
  private readonly lastLevel = new Map<string, number>();
  private tanks: TankConfig[] = [];

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly modbus: ModbusService,
    private readonly telegram: TelegramService,
    private readonly whatsapp: WhatsappService,
    private readonly gateway: AlertGateway,
    private readonly tanque: TanqueReadingsService,
    private readonly cisterna: CisternaReadingsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('flags', { infer: true }).acquisitionEnabled) return;

    this.tanks = [
      {
        name: 'tanque',
        device: 'tanque',
        lowMessage: 'Bajo nivel de agua en tanque principal',
        notifyWhatsapp: true,
        persist: (level) => this.tanque.createOne({ level }),
      },
      {
        name: 'cisterna',
        device: 'cisterna',
        lowMessage: 'Bajo nivel de agua en cisterna',
        notifyWhatsapp: false,
        persist: (level) => this.cisterna.createOne({ level }),
      },
    ];

    const interval = this.config.get('intervals', { infer: true }).waterPoll;
    const handle = setInterval(() => this.pollAll(), interval);
    this.scheduler.addInterval('water-poll', handle);
    this.logger.log('Monitor de agua (tanque + cisterna) iniciado');
  }

  /** Último nivel leído por tanque (para el snapshot REST). */
  getSnapshot(): { tanque: number | null; cisterna: number | null } {
    return {
      tanque: this.lastLevel.get('tanque') ?? null,
      cisterna: this.lastLevel.get('cisterna') ?? null,
    };
  }

  private async pollAll(): Promise<void> {
    for (const tank of this.tanks) {
      await this.pollTank(tank);
    }
  }

  private async pollTank(tank: TankConfig): Promise<void> {
    let level: number;
    try {
      const regs = await this.modbus.readHolding(tank.device, 3, 2);
      level = registersToScaled(regs);
    } catch {
      return;
    }

    this.lastLevel.set(tank.name, level);

    const sent = this.alertSent.get(tank.name) ?? false;
    if (level < LOW_THRESHOLD && !sent) {
      const site = this.config.get('channels', { infer: true }).sites.ramos;
      void this.telegram.sendMessage(site.telegramChatId, tank.lowMessage);
      if (tank.notifyWhatsapp) {
        void this.whatsapp.send(`RAMOS: ${tank.lowMessage}`, site.whatsappTo);
      }
      this.alertSent.set(tank.name, true);
    } else if (level >= RESET_THRESHOLD && sent) {
      this.alertSent.set(tank.name, false);
    }

    this.gateway.broadcast('water', { tank: tank.name, level });

    try {
      await tank.persist(level);
    } catch (err) {
      this.logger.error(
        `Error al persistir nivel de ${tank.name}: ${(err as Error).message}`,
      );
    }
  }
}
