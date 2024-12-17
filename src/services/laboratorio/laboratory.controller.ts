import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  ParseIntPipe,
} from '@nestjs/common';
import { CreateSensorReadingDto } from 'src/sensorReadings/dto/create-sensorReading.dto';
import { CreateSensorDto } from 'src/sensors/dto/create-sensor.dto';
import { ReadSensorReadingDto } from 'src/sensorReadings/dto/read-sensorReading.dto';
import { Sensor } from 'src/sensors/sensor.entity';
import { SensorsService } from 'src/sensors/sensor.service';
import { SensorReading } from 'src/sensorReadings/sensorReading.entity';
import { SensorReadingsService } from 'src/sensorReadings/sensorReading.service';

@Controller('laboratorio')
export class LaboratoryController {
  constructor(
    private readonly sensorsService: SensorsService,
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


  //Manejo lecturas
  @Get('/sensor/last/:id')
  findLast(@Param('id', ParseIntPipe) id: number): Promise<ReadSensorReadingDto> {
    return this.sensorReadingsService.findLast(id);
  }

  @Get('/sensor/interval/:id')
  findInterval(@Param('id', ParseIntPipe) id: number,@Body() date: {start:Date,end:Date}): Promise<ReadSensorReadingDto> {
    return this.sensorReadingsService.findInterval(id,date);
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
