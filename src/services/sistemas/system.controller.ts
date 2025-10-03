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
import { CreateSensorReadingDto } from 'src/sensorReadings/dto/create-sensorReading.dto';
import { CreateSensorDto } from 'src/sensors/dto/create-sensor.dto';
import { ReadSensorReadingDto } from 'src/sensorReadings/dto/read-sensorReading.dto';
import { Sensor } from 'src/sensors/sensor.entity';
import { SensorService } from './system.service';
import { SensorReadingsService } from './system.service';
import { UpdateSensorDto } from 'src/sensors/dto/update-sensor.dto';

@Controller('sistema')
export class SystemController {
  constructor(
    private readonly sensorsService: SensorService,
    private readonly sensorReadingsService: SensorReadingsService,
  ) {}

  //Manejo de sensores
  @Post('sensor')
  create(@Body() createSensorDto: CreateSensorDto): Promise<Sensor> {
    return this.sensorsService.create(createSensorDto);
  }

  @Get('/sensors')
  findAll(): Promise<Sensor[]> {
    return this.sensorsService.findAll();
  }

  @Get('/sensor/:id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Sensor> {
    return this.sensorsService.findOne(id);
  }

  @Put('/sensor/update')
  updateOne(
    //@Param('id', ParseIntPipe) id: number,
    @Body() sensorDto: UpdateSensorDto
  ): Promise<Sensor> {
    return this.sensorsService.updateOne(sensorDto.id,sensorDto);
  }


  //Manejo lecturas
  @Get('/sensor/last/:id')
  findLast(@Param('id', ParseIntPipe) id: number): Promise<ReadSensorReadingDto> {
    return this.sensorReadingsService.findLast(id);
  }

  @Get('/sensor/last/v2/:id')
  findLastV2(@Param('id', ParseIntPipe) id: number): Promise<{
    timestamp: Date; // un único valor, no array
    temp: number;
  }[]> {
    return this.sensorReadingsService.findLastV2(id);
  }

  @Get('/sensor/interval/:id')
  findInterval(
    @Param('id', ParseIntPipe) id: number,
    @Query('start') start: Date,
    @Query('end') end: Date
  ): Promise<ReadSensorReadingDto> {
    return this.sensorReadingsService.findInterval(id,start,end);
  }

  @Get('/sensor/interval/v2/:id')
  findIntervalV2(
    @Param('id', ParseIntPipe) id: number,
    @Query('start') start: Date,
    @Query('end') end: Date
  ): Promise<{
    timestamp: Date; // un único valor, no array
    temp: number;
  }[]> {
    return this.sensorReadingsService.findIntervalV2(id,start,end);
  }

  @Post('sensor/readings')
  insertMany(@Body() createReadingsDto: CreateSensorReadingDto[]): Promise<string> {
    return this.sensorReadingsService.createMany(createReadingsDto);
  }

  //@Delete(':id')
  //remove(@Param('id') id: string): Promise<void> {
  //  return this.sensorsService.remove(id);
  //}
}
