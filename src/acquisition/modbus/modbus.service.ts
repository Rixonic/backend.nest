import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ModbusRTU from 'modbus-serial';
import { AppConfig, ModbusDeviceConfig } from '../../config/configuration';

type RegisterType = 'holding' | 'input' | 'discrete';

/** Contadores acumulados por dispositivo (para diagnóstico de carga al PLC). */
export interface DeviceMetrics {
  /** Transacciones Modbus intentadas. */
  ops: number;
  /** Lecturas que terminaron en error. */
  errors: number;
  /** Subconjunto de `errors` que fueron timeouts. */
  timeouts: number;
  /** Reconexiones del socket TCP (no cuenta la primera conexión). */
  reconnects: number;
}

interface Device {
  cfg: ModbusDeviceConfig;
  client: ModbusRTU;
  /** Cola para serializar accesos al mismo cliente (modbus-serial no es concurrente). */
  queue: Promise<unknown>;
  connecting: boolean;
  /** True una vez que el dispositivo conectó por primera vez (evita logs por reconexión). */
  everConnected: boolean;
  metrics: DeviceMetrics;
}

/** Heurística para distinguir un timeout de otros errores de comunicación. */
function isTimeoutError(err: unknown): boolean {
  const e = err as { name?: string; errno?: string; message?: string };
  return (
    e?.name === 'TransactionTimedOutError' ||
    e?.errno === 'ETIMEDOUT' ||
    /timed out/i.test(e?.message ?? '')
  );
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
        metrics: { ops: 0, errors: 0, timeouts: 0, reconnects: 0 },
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

  /**
   * Lee `quantity` discrete inputs (FC2) desde `address`. Devuelve un 0/1 por
   * entrada (un bit, no un registro de 16 bits como holding/input). Es la
   * función que usan los PLC de transferencia, donde cada señal es un bit.
   */
  readDiscrete(
    deviceName: string,
    address: number,
    quantity: number,
  ): Promise<number[]> {
    return this.enqueue(deviceName, 'discrete', address, quantity);
  }

  /** Snapshot de los contadores acumulados de un dispositivo (para métricas). */
  getMetrics(deviceName: string): DeviceMetrics | undefined {
    const device = this.devices.get(deviceName);
    return device ? { ...device.metrics } : undefined;
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
    device.metrics.ops += 1;
    try {
      if (type === 'discrete') {
        // FC2: modbus-serial devuelve booleanos; los normalizamos a 0/1 para
        // que el resto del pipeline siga tratando todo como number[].
        const res = await device.client.readDiscreteInputs(address, quantity);
        return res.data.map((bit) => (bit ? 1 : 0));
      }
      const res =
        type === 'holding'
          ? await device.client.readHoldingRegisters(address, quantity)
          : await device.client.readInputRegisters(address, quantity);
      return res.data;
    } catch (err) {
      device.metrics.errors += 1;
      if (isTimeoutError(err)) device.metrics.timeouts += 1;
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
    // poll. Las reconexiones posteriores son normales y silenciosas (pero se
    // cuentan en las métricas).
    if (!device.everConnected) {
      device.everConnected = true;
      this.logger.debug(`Conectado a ${device.cfg.name} (${host}:${port})`);
    } else {
      device.metrics.reconnects += 1;
    }
  }

  private closeQuietly(device: Device): Promise<void> {
    return new Promise((resolve) => {
      if (!device.client.isOpen) return resolve();
      device.client.close(() => resolve());
    });
  }
}
