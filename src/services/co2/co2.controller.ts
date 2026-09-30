import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Co2Sensor } from 'src/co2/co2.entity';
import { Co2SensorService, Co2ReadingsService } from './co2.service';

@Controller('co2')
export class Co2Controller {
  constructor(
    private readonly sensorService: Co2SensorService,
    private readonly readingsService: Co2ReadingsService,
  ) {}

  @Get('/sensors')
  findSensors(): Promise<Co2Sensor[]> {
    return this.sensorService.findAll();
  }

  @Get('/:sensorId/last')
  findLast(
    @Param('sensorId', ParseIntPipe) sensorId: number,
  ): Promise<{ timestamp: Date; pressure: number }[]> {
    return this.readingsService.findLast(sensorId);
  }

  @Get('/:sensorId/interval')
  findInterval(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('start') start: Date,
    @Query('end') end: Date,
  ): Promise<{ timestamp: Date; pressure: number }[]> {
    return this.readingsService.findInterval(sensorId, start, end);
  }
}
