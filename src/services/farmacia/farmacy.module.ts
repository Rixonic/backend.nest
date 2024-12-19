import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmacySensor, Sensor } from 'src/sensors/sensor.entity';  // Importa la entidad Sensor
import { FarmacySensorReading, SensorReading } from 'src/sensorReadings/sensorReading.entity';  // Importa la entidad SensorReading
import { SensorService } from './farmacy.service'; // Importa el servicio de Sensors
import { SensorReadingsService } from './farmacy.service';  // Importa el servicio de SensorReadings
import { FarmacyController } from './farmacy.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FarmacySensor, FarmacySensorReading])],
  providers: [
    SensorService,  // Registra el servicio de Sensors
    SensorReadingsService,  // Registra el servicio de SensorReadings
  ],
  controllers: [FarmacyController],
})
export class FarmacyModule {}
