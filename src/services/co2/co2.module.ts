import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Co2Sensor, Co2Reading } from 'src/co2/co2.entity';
import { Co2Controller } from './co2.controller';
import { Co2SensorService, Co2ReadingsService } from './co2.service';

@Module({
  imports: [TypeOrmModule.forFeature([Co2Sensor, Co2Reading], 'sensors')],
  providers: [Co2SensorService, Co2ReadingsService],
  controllers: [Co2Controller],
  exports: [Co2SensorService, Co2ReadingsService],
})
export class Co2Module {}
