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
import { PLCService } from './plc.service';
import { UpdateSensorDto } from 'src/sensors/dto/update-sensor.dto';
import { Alarms } from 'src/plc/plc.entity';

@Controller('plc')
export class PLCController {
  constructor(
    private readonly PLCService: PLCService,
  ) {}

  //Manejo de sensores


  @Get('/alarms')
  findAll(): Promise<Alarms[]> {
    return this.PLCService.findAll();
  }
}
