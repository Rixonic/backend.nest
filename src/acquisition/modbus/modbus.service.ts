import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ModbusRTU from 'modbus-serial';
import { AppConfig, ModbusDeviceConfig } from '../../config/configuration';

type RegisterType = 'holding' | 'input';

interface Device {
  cfg: ModbusDeviceConfig;
  client: ModbusRTU;
  /** Cola para serializar accesos al mismo cliente (modbus-serial no es concurrente). */
  queue: Promise<unknown>;
  connecting: boolean;
  /** True una vez que el dispositivo conectó por primera vez (evita logs por reconexión). */
  everConnected: boolean;
}

/**
 * Pool de clientes Modbus TCP, uno por dispositivo configurado.
 *
 * Cada dispositivo tiene su propio cliente y una cola que serializa las lecturas
 * (la librería `modbus-serial` no soporta requests concurrentes sobre el mismo
 * socket). La conexión es perezosa y se reintenta automáticamente ante fallos.
 */
@Injectable()
export class ModbusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModbusService.name);
  private readonly devices = new Map<string, Device>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const modbus = this.config.get('modbus', { infer: true });
    for (const cfg of Object.values(modbus)) {
      this.devices.set(cfg.name, {
        cfg,
        client: new ModbusRTU(),
        queue: Promise.resolve(),
        connecting: false,
        everConnected: false,
      });
    }
    this.logger.log(
      `Pool Modbus inicializado: ${[...this.devices.keys()].join(', ')}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    for (const device of this.devices.values()) {
      await this.closeQuietly(device);
    }
  }

  /** Lee `quantity` holding registers desde `address` en el dispositivo dado. */
  readHolding(
    deviceName: string,
    address: number,
    quantity: number,
  ): Promise<number[]> {
    return this.enqueue(deviceName, 'holding', address, quantity);
  }

  /** Lee `quantity` input registers desde `address` en el dispositivo dado. */
  readInput(
    deviceName: string,
    address: number,
    quantity: number,
  ): Promise<number[]> {
    return this.enqueue(deviceName, 'input', address, quantity);
  }

  private enqueue(
    deviceName: string,
    type: RegisterType,
    address: number,
    quantity: number,
  ): Promise<number[]> {
    const device = this.devices.get(deviceName);
    if (!device) {
      return Promise.reject(
        new Error(`Dispositivo Modbus desconocido: ${deviceName}`),
      );
    }
    const result = device.queue
      .catch(() => undefined)
      .then(() => this.doRead(device, type, address, quantity));
    // La cola sólo encadena; no propaga errores para no romper el siguiente request.
    device.queue = result.catch(() => undefined);
    return result;
  }

  private async doRead(
    device: Device,
    type: RegisterType,
    address: number,
    quantity: number,
  ): Promise<number[]> {
    await this.ensureConnected(device);
    device.client.setID(device.cfg.unitId);
    try {
      const res =
        type === 'holding'
          ? await device.client.readHoldingRegisters(address, quantity)
          : await device.client.readInputRegisters(address, quantity);
      return res.data;
    } catch (err) {
      // Forzamos reconexión en el próximo intento.
      await this.closeQuietly(device);
      throw err;
    }
  }

  private async ensureConnected(device: Device): Promise<void> {
    if (device.client.isOpen) return;
    const { host, port } = device.cfg;
    device.client.setTimeout(1000);
    await device.client.connectTCP(host, { port });
    // Solo se loguea la primera conexión: algunos gateways Modbus cierran el
    // socket tras cada transacción, lo que reconectaría (y loguearía) en cada
    // poll. Las reconexiones posteriores son normales y silenciosas.
    if (!device.everConnected) {
      device.everConnected = true;
      this.logger.debug(`Conectado a ${device.cfg.name} (${host}:${port})`);
    }
  }

  private closeQuietly(device: Device): Promise<void> {
    return new Promise((resolve) => {
      if (!device.client.isOpen) return resolve();
      device.client.close(() => resolve());
    });
  }
}
