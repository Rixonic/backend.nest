import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { OxygenSensor } from 'src/oxigeno/oxigeno.entity';
import { OxygenSensorService, OxygenReadingsService } from './oxigeno.service';

@Controller('oxigeno')
export class OxygenController {
  constructor(
    private readonly sensorService: OxygenSensorService,
    private readonly readingsService: OxygenReadingsService,
  ) {}

  @Get('/sensors')
  findSensors(): Promise<OxygenSensor[]> {
    return this.sensorService.findAll();
  }

  @Get('/:sensorId/last/v2')
  findLastV2(
    @Param('sensorId', ParseIntPipe) sensorId: number,
  ): Promise<{ timestamp: Date; pressure: number }[]> {
    return this.readingsService.findLastV2(sensorId);
  }

  @Get('/:sensorId/interval/v2')
  findIntervalV2(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('start') start: Date,
    @Query('end') end: Date,
  ): Promise<{ timestamp: Date; pressure: number }[]> {
    return this.readingsService.findIntervalV2(sensorId, start, end);
  }
}
