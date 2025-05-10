import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NurserySensor } from 'src/sensors/sensor.entity';
import { NurserySensorReading } from 'src/sensorReadings/sensorReading.entity';
import { SensorService } from './nursery.service';
import { SensorReadingsService } from './nursery.service';
import { NurseryController } from './nursery.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NurserySensor, NurserySensorReading], 'sensors')
  ],
  providers: [
    SensorService,
    SensorReadingsService,
  ],
  controllers: [NurseryController],
  exports: [SensorService, SensorReadingsService],
})
export class NurseryModule {}
