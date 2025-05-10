import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaboratorySensor } from 'src/sensors/sensor.entity';
import { LaboratorySensorReading } from 'src/sensorReadings/sensorReading.entity';
import { SensorService } from './laboratory.service';
import { SensorReadingsService } from './laboratory.service';
import { LaboratoryController } from './laboratory.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LaboratorySensor, LaboratorySensorReading], 'sensors')
  ],
  providers: [
    SensorService,
    SensorReadingsService,
  ],
  controllers: [LaboratoryController],
  exports: [SensorService, SensorReadingsService],
})
export class LaboratoryModule {}
