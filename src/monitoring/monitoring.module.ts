import { Module } from '@nestjs/common';
import { LaboratoryModule } from '../services/laboratorio/laboratory.module';
import { FarmacyModule } from '../services/farmacia/farmacy.module';
import { SystemModule } from '../services/sistemas/system.module';
import { TemperatureMonitorService } from './temperature-monitor.service';

/**
 * Monitoreo de temperatura (laboratorio/farmacia/sistemas). Importa los módulos
 * de departamento para reutilizar sus servicios de sensores/lecturas, y la capa
 * de adquisición (global) para Modbus/MQTT.
 */
@Module({
  imports: [LaboratoryModule, FarmacyModule, SystemModule],
  providers: [TemperatureMonitorService],
  exports: [TemperatureMonitorService],
})
export class MonitoringModule {}
