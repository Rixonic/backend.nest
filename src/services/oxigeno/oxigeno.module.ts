import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OxygenSensor, OxygenReading } from 'src/oxigeno/oxigeno.entity';
import { OxygenController } from './oxigeno.controller';
import { OxygenSensorService, OxygenReadingsService } from './oxigeno.service';

@Module({
  imports: [TypeOrmModule.forFeature([OxygenSensor, OxygenReading], 'sensors')],
  providers: [OxygenSensorService, OxygenReadingsService],
  controllers: [OxygenController],
  exports: [OxygenSensorService, OxygenReadingsService],
})
export class OxygenModule {}
