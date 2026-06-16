import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ElectricalModule } from '../electrical/electrical.module';
import { WaterMonitorModule } from '../water/water.module';
import { MonitorController } from './monitor.controller';

/**
 * Endpoint REST de snapshot en vivo. Agrega los tres monitores (temperatura,
 * transferencia, agua) para servir su estado actual en una sola respuesta.
 */
@Module({
  imports: [MonitoringModule, ElectricalModule, WaterMonitorModule],
  controllers: [MonitorController],
})
export class MonitorModule {}
