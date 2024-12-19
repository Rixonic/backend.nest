import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmacySensor, LaboratorySensor, Sensor } from 'src/sensors/sensor.entity';  // Importa la entidad Sensor
import { FarmacySensorReading, LaboratorySensorReading, SensorReading } from 'src/sensorReadings/sensorReading.entity';  // Importa la entidad SensorReading
import { SensorService } from './laboratory.service';  // Importa el servicio de Sensors
import { SensorReadingsService } from './laboratory.service';  // Importa el servicio de SensorReadings
import { LaboratoryController } from './laboratory.controller';


@Module({
  imports: [TypeOrmModule.forFeature([LaboratorySensor, LaboratorySensorReading])],
  providers: [
    SensorService,  // Registra el servicio de Sensors
    SensorReadingsService,  // Registra el servicio de SensorReadings
  ],
  controllers: [LaboratoryController],
})
export class LaboratoryModule {}
