import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { OxygenSensor } from 'src/oxigeno/oxigeno.entity';
import {
  OxygenSensorService,
  OxygenReadingsService,
  OxygenLiquidService,
} from './oxigeno.service';

@Controller('oxigeno')
export class OxygenController {
  constructor(
    private readonly sensorService: OxygenSensorService,
    private readonly readingsService: OxygenReadingsService,
    private readonly liquidService: OxygenLiquidService,
  ) {}

  @Get('/sensors')
  findSensors(): Promise<OxygenSensor[]> {
    return this.sensorService.findAll();
  }

  @Get('/liquid/last')
  findLiquidLast(): Promise<{ timestamp: Date; measure: number }[]> {
    return this.liquidService.findLast();
  }

  @Get('/liquid/interval')
  findLiquidInterval(
    @Query('start') start: Date,
    @Query('end') end: Date,
  ): Promise<{ timestamp: Date; measure: number }[]> {
    return this.liquidService.findInterval(start, end);
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
