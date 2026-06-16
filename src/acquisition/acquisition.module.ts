import { Global, Module } from '@nestjs/common';
import { ModbusService } from './modbus/modbus.service';
import { MqttService } from './mqtt/mqtt.service';

/**
 * Capa de adquisición de datos: clientes Modbus TCP y MQTT.
 * Global para que cualquier monitor (temperatura, transferencia, agua) pueda
 * inyectar `ModbusService`/`MqttService` sin re-importar el módulo.
 */
@Global()
@Module({
  providers: [ModbusService, MqttService],
  exports: [ModbusService, MqttService],
})
export class AcquisitionModule {}
