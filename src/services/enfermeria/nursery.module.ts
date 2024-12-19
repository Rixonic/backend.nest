import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NurserySensor, Sensor } from 'src/sensors/sensor.entity';  // Importa la entidad Sensor
import { NurserySensorReading, SensorReading } from 'src/sensorReadings/sensorReading.entity';  // Importa la entidad SensorReading
import { SensorService } from './nursery.service';  // Importa el servicio de Sensors
import { SensorReadingsService } from './nursery.service'; // Importa el servicio de SensorReadings
import { NurseryController } from './nursery.controller';


@Module({
  imports: [TypeOrmModule.forFeature([NurserySensor, NurserySensorReading])],
  providers: [
    SensorService,  // Registra el servicio de Sensors
    SensorReadingsService,  // Registra el servicio de SensorReadings
  ],
  controllers: [NurseryController],
})
export class NurseryModule {}
