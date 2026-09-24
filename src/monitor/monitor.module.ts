import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ElectricalModule } from '../electrical/electrical.module';
import { WaterMonitorModule } from '../water/water.module';
import { OxygenMonitorModule } from '../oxygen/oxygen.module';
import { LiquidMonitorModule } from '../liquid/liquid.module';
import { MonitorController } from './monitor.controller';

/**
 * Endpoint REST de snapshot en vivo. Agrega los monitores (temperatura,
 * transferencia, agua, oxígeno, oxígeno líquido) para servir su estado actual
 * en una sola respuesta.
 */
@Module({
  imports: [
    MonitoringModule,
    ElectricalModule,
    WaterMonitorModule,
    OxygenMonitorModule,
    LiquidMonitorModule,
  ],
  controllers: [MonitorController],
})
export class MonitorModule {}
