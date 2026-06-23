import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/configuration';
import { ModbusService } from '../acquisition/modbus/modbus.service';
import { AlertGateway } from '../notifications/alert.gateway';
import { TelegramService } from '../notifications/telegram.service';
import { WhatsappService } from '../notifications/whatsapp.service';
import {
  CASTELAR_MESSAGES,
  RAMOS_MESSAGES,
  SignalMap,
  decodeCastelar,
  decodeRamos,
} from './transfer.maps';

interface SiteConfig {
  name: string;
  device: 'ramos' | 'castelar';
  regType: 'input' | 'holding' | 'discrete';
  address: number;
  quantity: number;
  decode: (regs: number[]) => SignalMap;
  messages: Record<string, string>;
  prefix: string;
  telegramChatId: number;
  whatsappTo: string;
}

/**
 * Monitor de los PLC de transferencia eléctrica (Ramos Mejía y Castelar).
 * Hace polling del bitfield, lo decodifica y detecta flancos de subida contra
 * el estado previo: por cada señal que pasa de false→true envía Telegram +
 * WhatsApp y difunde el estado por WebSocket. Reemplaza los nodos
 * "Data Converter" de Node-RED.
 */
@Injectable()
export class TransferMonitorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TransferMonitorService.name);
  private readonly previous = new Map<string, SignalMap>();
  private readonly confirmed = new Set<string>();
  private sites: SiteConfig[] = [];

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly modbus: ModbusService,
    private readonly telegram: TelegramService,
    private readonly whatsapp: WhatsappService,
    private readonly gateway: AlertGateway,
  ) {}

  /** Último estado decodificado por sitio (para el snapshot REST). */
  getSnapshot(): { ramos: SignalMap | null; castelar: SignalMap | null } {
    return {
      ramos: this.previous.get('ramos') ?? null,
      castelar: this.previous.get('castelar') ?? null,
    };
  }

  onApplicationBootstrap(): void {
    if (!this.config.get('flags', { infer: true }).acquisitionEnabled) return;

    const sitesCfg = this.config.get('channels', { infer: true }).sites;
    this.sites = [
      {
        name: 'ramos',
        device: 'ramos',
        regType: 'discrete',
        address: 8000,
        quantity: 89,
        decode: decodeRamos,
        messages: RAMOS_MESSAGES,
        prefix: 'RAMOS: ',
        telegramChatId: sitesCfg.ramos.telegramChatId,
        whatsappTo: sitesCfg.ramos.whatsappTo,
      },
      {
        name: 'castelar',
        device: 'castelar',
        regType: 'holding',
        address: 0,
        quantity: 3,
        decode: decodeCastelar,
        messages: CASTELAR_MESSAGES,
        prefix: 'CASTELAR: ',
        telegramChatId: sitesCfg.castelar.telegramChatId,
        whatsappTo: sitesCfg.castelar.whatsappTo,
      },
    ];

    const interval = this.config.get('intervals', {
      infer: true,
    }).plcTransferPoll;
    const handle = setInterval(() => this.pollAll(), interval);
    this.scheduler.addInterval('transfer-poll', handle);
    this.logger.log('Monitor de transferencia (Ramos + Castelar) iniciado');
  }

  private async pollAll(): Promise<void> {
    for (const site of this.sites) {
      await this.pollSite(site);
    }
  }

  private async pollSite(site: SiteConfig): Promise<void> {
    let regs: number[];
    try {
      regs = await this.readRegisters(site);
    } catch (err) {
      this.logger.debug(`${site.name}: lectura fallida (${(err as Error).message})`);
      return; // sin lectura: no notifica este ciclo
    }

    if (!this.confirmed.has(site.name)) {
      this.confirmed.add(site.name);
      this.logger.log(`${site.name}: primera lectura OK (${regs.length} registros)`);
    }

    const current = site.decode(regs);
    const old = this.previous.get(site.name);

    if (old) {
      for (const key of Object.keys(current)) {
        if (current[key] && !old[key]) {
          this.notify(site, key);
        }
      }
    }

    this.previous.set(site.name, current);
    this.gateway.broadcast('transfer', { site: site.name, signals: current });
  }

  private readRegisters(site: SiteConfig): Promise<number[]> {
    switch (site.regType) {
      case 'discrete':
        return this.modbus.readDiscrete(
          site.device,
          site.address,
          site.quantity,
        );
      case 'input':
        return this.modbus.readInput(site.device, site.address, site.quantity);
      case 'holding':
        return this.modbus.readHolding(
          site.device,
          site.address,
          site.quantity,
        );
    }
  }

  private notify(site: SiteConfig, key: string): void {
    const text = site.messages[key];
    if (!text) return;
    void this.telegram.sendMessage(site.telegramChatId, text);
    void this.whatsapp.send(`${site.prefix}${text}`, site.whatsappTo);
  }
}
