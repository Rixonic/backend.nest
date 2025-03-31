import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { CreateSensorDto } from 'src/sensors/dto/create-sensor.dto';
import { LaboratorySensor, Sensor } from '../../sensors/sensor.entity';
import { LaboratorySensorReading, SensorReading } from 'src/sensorReadings/sensorReading.entity';
import { ReadSensorReadingDto } from 'src/sensorReadings/dto/read-sensorReading.dto';
import { CreateSensorReadingDto } from 'src/sensorReadings/dto/create-sensorReading.dto';
import { UpdateSensorDto } from 'src/sensors/dto/update-sensor.dto';

@Injectable()
export class SensorService {
  constructor(
    @InjectRepository(LaboratorySensor)
    private readonly sensorsRepository: Repository<LaboratorySensor>,
  ) { }

  create(createSensorDto: CreateSensorDto): Promise<Sensor> {
    const sensor = new LaboratorySensor();
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

  async updateOne(id:number,sensorDto: UpdateSensorDto): Promise<Sensor | null> {
    const sensor = await this.sensorsRepository.findOne({ where: { id } });

    if (!sensor) {
      return null
    }

    const updatedFields: Partial<Sensor> = {};
  
    if (sensorDto.name !== undefined) {
      updatedFields.name = sensorDto.name;
    }
  
    if (sensorDto.labId !== undefined) {
      updatedFields.labId = sensorDto.labId;
    }
  
    if (sensorDto.location !== undefined) {
      updatedFields.location = sensorDto.location;
    }

    if (sensorDto.max !== undefined) {
      updatedFields.max = sensorDto.max;
    }
  
    if (sensorDto.min !== undefined) {
      updatedFields.min = sensorDto.min;
    }
  
    if (sensorDto.location !== undefined) {
      updatedFields.time = sensorDto.time;
    }

    await this.sensorsRepository.update(id, updatedFields);

    return this.sensorsRepository.findOne({ where: { id } });
  }
  
}


@Injectable()
export class SensorReadingsService {
  constructor(
    @InjectRepository(LaboratorySensorReading)
    private readonly sensorReadingsRepository: Repository<LaboratorySensorReading>,
  ) { }

  createOne(createSensorReadingDto: CreateSensorReadingDto): Promise<SensorReading> {
    const sensorReading = new LaboratorySensorReading();
    sensorReading.sensor_id = createSensorReadingDto.id;
    sensorReading.temp = createSensorReadingDto.temp;

    return this.sensorReadingsRepository.save(sensorReading);
  }

  async createMany(createSensorReadingsDto: CreateSensorReadingDto[]): Promise<string> {
    const sensorReadings = createSensorReadingsDto.map(dto => {
      const sensorReading = new LaboratorySensorReading();
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
      take: 20, // Limitamos a las últimas 30 entradas
    })

    const tempArray = sensorReadings.map(row => row.temp).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      temp: tempArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findInterval(sensorId: number,  start: Date, end: Date ): Promise<ReadSensorReadingDto> {
    //console.log("Start: ",start)
    //console.log("End: ",end)
    const sensorReadings = await this.sensorReadingsRepository.find({
      where: {
        sensor_id: sensorId,
        timestamp: Between(start, end),
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