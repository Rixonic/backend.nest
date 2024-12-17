import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sensor } from 'src/sensors/sensor.entity';  // Importa la entidad Sensor
import { SensorReading } from 'src/sensorReadings/sensorReading.entity';  // Importa la entidad SensorReading
import { SensorsService } from 'src/sensors/sensor.service';  // Importa el servicio de Sensors
import { SensorReadingsService } from 'src/sensorReadings/sensorReading.service';  // Importa el servicio de SensorReadings
import { LaboratoryController } from './laboratory.controller';


@Module({
  imports: [TypeOrmModule.forFeature([Sensor, SensorReading])],
  providers: [
    SensorsService,  // Registra el servicio de Sensors
    SensorReadingsService,  // Registra el servicio de SensorReadings
  ],
  controllers: [LaboratoryController],
})
export class LaboratoryModule {}
