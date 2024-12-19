import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { CreateSensorDto } from 'src/sensors/dto/create-sensor.dto';
import { NurserySensor, Sensor } from '../../sensors/sensor.entity';
import { NurserySensorReading, SensorReading } from 'src/sensorReadings/sensorReading.entity';
import { ReadSensorReadingDto } from 'src/sensorReadings/dto/read-sensorReading.dto';
import { CreateSensorReadingDto } from 'src/sensorReadings/dto/create-sensorReading.dto';

@Injectable()
export class SensorService {
  constructor(
    @InjectRepository(NurserySensor)
    private readonly sensorsRepository: Repository<NurserySensor>,
  ) { }

  create(createSensorDto: CreateSensorDto): Promise<Sensor> {
    const sensor = new NurserySensor();
    sensor.sensorId = createSensorDto.sensorId;
    //sensor.lastName = createSensorDto.lastName;

    return this.sensorsRepository.save(sensor);
  }

  async findAll(): Promise<Sensor[]> {
    return this.sensorsRepository.find();
  }

  findOne(id: number): Promise<Sensor> {
    return this.sensorsRepository.findOneBy({ id: id });
  }
}


@Injectable()
export class SensorReadingsService {
  constructor(
    @InjectRepository(NurserySensorReading)
    private readonly sensorReadingsRepository: Repository<NurserySensorReading>,
  ) { }

  createOne(createSensorReadingDto: CreateSensorReadingDto): Promise<SensorReading> {
    const sensorReading = new NurserySensorReading();
    sensorReading.sensor_id = createSensorReadingDto.id;
    sensorReading.temp = createSensorReadingDto.temp;

    return this.sensorReadingsRepository.save(sensorReading);
  }

  async createMany(createSensorReadingsDto: CreateSensorReadingDto[]): Promise<string> {
    const sensorReadings = createSensorReadingsDto.map(dto => {
      const sensorReading = new NurserySensorReading();
      sensorReading.sensor_id = dto.id;
      sensorReading.temp = dto.temp;
      //sensorReading.timestamp = new Date();  // Asumiendo que timestamp es el momento actual
      return sensorReading;
    });

    await this.sensorReadingsRepository.save(sensorReadings)

    return "OK";
  }

  async findAll(): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.sensorReadingsRepository.find()

    const tempArray = sensorReadings.map(row => row.temp).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      temp: tempArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findLast(sensorId: number): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.sensorReadingsRepository.find({
      where: { sensor_id: sensorId },
      order: {
        timestamp: 'DESC', // Ordenamos por timestamp en orden descendente
      },
      take: 60, // Limitamos a las últimas 30 entradas
    })

    const tempArray = sensorReadings.map(row => row.temp).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      temp: tempArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findInterval(sensorId: number, date: { start: Date, end: Date }): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.sensorReadingsRepository.find({
      where: {
        sensor_id: sensorId,
        timestamp: Between(date.start, date.end),
      },
      order: {
        timestamp: 'DESC',
      },
      //take: 30, 
    })

    const tempArray = sensorReadings.map(row => row.temp).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      temp: tempArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }
}
