import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestSensor } from 'src/sensors/sensor.entity';  // Importa la entidad Sensor
import { TestSensorReading } from 'src/sensorReadings/sensorReading.entity';  // Importa la entidad SensorReading
import { SensorService } from './test.service';  // Importa el servicio de Sensors
import { SensorReadingsService } from './test.service';  // Importa el servicio de SensorReadings
import { TestController } from './test.controller';

@Module({
   imports: [TypeOrmModule.forFeature([TestSensor, TestSensorReading])],
   providers: [
     SensorService,  // Registra el servicio de Sensors
     SensorReadingsService,  // Registra el servicio de SensorReadings
   ],
   controllers: [TestController],
})
export class TestModule {}