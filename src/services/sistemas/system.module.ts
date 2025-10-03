import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSensor } from 'src/sensors/sensor.entity';
import { SystemSensorReading } from 'src/sensorReadings/sensorReading.entity';
import { SensorService } from './system.service';
import { SensorReadingsService } from './system.service';
import { SystemController } from './system.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemSensor, SystemSensorReading], 'sensors')
  ],
  providers: [
    SensorService,
    SensorReadingsService,
  ],
  controllers: [SystemController],
  exports: [SensorService, SensorReadingsService],
})
export class SystemModule {}
