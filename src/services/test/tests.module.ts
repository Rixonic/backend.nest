import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sensor } from 'src/sensors/sensor.entity';  // Importa la entidad Sensor
import { SensorReading } from 'src/sensorReadings/sensorReading.entity';  // Importa la entidad SensorReading
import { SensorService } from './test.service';  // Importa el servicio de Sensors
import { SensorReadingsService } from './test.service';  // Importa el servicio de SensorReadings
import { TestController } from './test.controller';
import { getRepositoryToken } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Sensor, SensorReading], 
      'testConnection' // Nombre personalizado para la conexión
    ),
  ],
  providers: [
    {
      provide: getRepositoryToken(Sensor, 'testConnection'),
      useFactory: (connection) => connection.getRepository(Sensor),
      inject: ['TypeORMInstance'],
    },
    {
      provide: getRepositoryToken(SensorReading, 'testConnection'),
      useFactory: (connection) => connection.getRepository(SensorReading),
      inject: ['TypeORMInstance'],
    },
    SensorService,
    SensorReadingsService,
  ],
  controllers: [TestController],
})
export class TestModule {}