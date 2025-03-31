import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmacySensor } from 'src/sensors/sensor.entity';
import { FarmacySensorReading } from 'src/sensorReadings/sensorReading.entity';
import { SensorService } from './farmacy.service';
import { SensorReadingsService } from './farmacy.service';
import { FarmacyController } from './farmacy.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FarmacySensor, FarmacySensorReading])],
  providers: [
    SensorService,
    SensorReadingsService,
  ],
  controllers: [FarmacyController],
  exports: [SensorService, SensorReadingsService],
})
export class FarmacyModule {}
