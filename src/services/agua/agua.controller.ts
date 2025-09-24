import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  ParseIntPipe,
  Query,
  Put,
} from '@nestjs/common';
import { CreateSensorDto } from 'src/agua/dto/create-sensor.dto';
import { ReadSensorReadingDto } from 'src/agua/dto/read-sensor.dto';
import { Sensor } from 'src/sensors/sensor.entity';
import { TanqueService, TanqueReadingsService, CisternaService, CisternaReadingsService } from './agua.service';
import { UpdateSensorDto } from 'src/sensors/dto/update-sensor.dto';

@Controller('agua')
export class WaterController {
  constructor(
    private readonly tanqueService: TanqueService,
    private readonly tanqueReadingsService: TanqueReadingsService,
    private readonly cisternaService: CisternaService,
    private readonly cisternaReadingsService: CisternaReadingsService,
  ) {}


  //Manejo lecturas TANQUE
  @Get('/tanque/last')
  findLastTanque(): Promise<ReadSensorReadingDto> {
    return this.tanqueReadingsService.findLast();
  }

  @Get('/tanque/last/v2')
  findLastV2Tanque(): Promise<{
    timestamp: Date; // un único valor, no array
    level: number;
  }[]> {
    return this.tanqueReadingsService.findLastV2();
  }

  @Get('/tanque/interval')
  findIntervalTanque(
    @Query('start') start: Date,
    @Query('end') end: Date
  ): Promise<ReadSensorReadingDto> {
    return this.tanqueReadingsService.findInterval(start,end);
  }

  @Post('tanque/readings')
  insertManyTanque(@Body() createReadingsDto: CreateSensorDto): Promise<string> {
    return this.tanqueReadingsService.createOne(createReadingsDto);
  }


  //Manejo lecturas CISTERNA
  @Get('/cisterna/last')
  findLastCisterna(): Promise<ReadSensorReadingDto> {
    return this.cisternaReadingsService.findLast();
  }

  @Get('/cisterna/last/v2')
  findLastV2Cisterna(): Promise<{
    timestamp: Date; // un único valor, no array
    level: number;
  }[]> {
    return this.cisternaReadingsService.findLastV2();
  }

  @Get('/cisterna/interval')
  findIntervalCisterna(
    @Query('start') start: Date,
    @Query('end') end: Date
  ): Promise<ReadSensorReadingDto> {
    return this.cisternaReadingsService.findInterval(start,end);
  }

  @Post('cisterna/readings')
  insertManyCisterna(@Body() createReadingsDto: CreateSensorDto): Promise<string> {
    return this.cisternaReadingsService.createOne(createReadingsDto);
  }



  //@Delete(':id')
  //remove(@Param('id') id: string): Promise<void> {
  //  return this.sensorsService.remove(id);
  //}
}
