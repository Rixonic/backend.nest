import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  OxygenSensor,
  OxygenReading,
  OxygenLiquidReading,
} from 'src/oxigeno/oxigeno.entity';
import { OxygenController } from './oxigeno.controller';
import {
  OxygenSensorService,
  OxygenReadingsService,
  OxygenLiquidService,
} from './oxigeno.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [OxygenSensor, OxygenReading, OxygenLiquidReading],
      'sensors',
    ),
  ],
  providers: [OxygenSensorService, OxygenReadingsService, OxygenLiquidService],
  controllers: [OxygenController],
  exports: [OxygenSensorService, OxygenReadingsService, OxygenLiquidService],
})
export class OxygenModule {}
