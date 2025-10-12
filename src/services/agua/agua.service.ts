import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { TankSensorReading, CisternaSensorReading } from '../../agua/agua.entity';
import { WaterReading } from 'src/agua/agua.entity';
import { ReadSensorReadingDto } from 'src/agua/dto/read-sensor.dto';
import { CreateSensorDto } from 'src/agua/dto/create-sensor.dto';

@Injectable()
export class TanqueService {
  constructor(
    @InjectRepository(TankSensorReading, 'sensors')
    private readonly sensorsRepository: Repository<TankSensorReading>,
  ) { }
}


@Injectable()
export class TanqueReadingsService {
  constructor(
    @InjectRepository(TankSensorReading, 'sensors')
    private readonly sensorReadingsRepository: Repository<TankSensorReading>,
  ) { }

  async createOne(createSensorReadingDto: CreateSensorDto): Promise<string> {
    const sensorReading = new TankSensorReading();
    sensorReading.level = createSensorReadingDto.level;

    await this.sensorReadingsRepository.save(sensorReading);

    return "OK";
  }

  async findAll(): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.sensorReadingsRepository.find()

    const levelArray = sensorReadings.map(row => row.level).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      level: levelArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findLast(): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.sensorReadingsRepository.find({
      order: {
        timestamp: 'DESC', // Ordenamos por timestamp en orden descendente
      },
      take: 20, // Limitamos a las últimas 30 entradas
    })

    const levelArray = sensorReadings.map(row => row.level).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      level: levelArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findLastV2(): Promise<{
    timestamp: Date; // un único valor, no array
    level: number;
  }[]> {

    const sensorReadings = await this.sensorReadingsRepository.find({
      order: {
        timestamp: 'DESC', // Ordenamos por timestamp en orden descendente
      },
      take: 60, // Limitamos a las últimas 30 entradas
    })

    //const tempArray = sensorReadings.map(row => row.temp).reverse();;
    //const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    //const formattedResult = {
    //  temp: tempArray,
    //  timestamp: timestampArray
    //};

    return sensorReadings
      .map(reading => ({
        timestamp: new Date(reading.timestamp),
        level: reading.level, // Aseguramos que sea number
        //sensor_id: reading.sensor_id
      }))
      .reverse();
  }

  async findInterval(start: Date, end: Date): Promise<ReadSensorReadingDto> {
    //console.log("Start: ",start)
    //console.log("End: ",end)
    const sensorReadings = await this.sensorReadingsRepository.find({
      where: {
        timestamp: Between(start, end),
      },
      order: {
        timestamp: 'DESC',
      },
      //take: 30, 
    })

    const levelArray = sensorReadings.map(row => row.level).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      level: levelArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findIntervalV2(start: Date, end: Date): Promise<{
    timestamp: Date; // un único valor, no array
    level: number;
  }[]> {
    const sensorReadings = await this.sensorReadingsRepository.find({
      where: {
        timestamp: Between(start, end),
      },
      order: {
        timestamp: 'DESC',
      },
      //take: 30, 
    })

    return sensorReadings
      .map(reading => ({
        timestamp: new Date(reading.timestamp),
        level: reading.level, // Aseguramos que sea number
        //sensor_id: reading.sensor_id
      }))
      .reverse();
  }

}

@Injectable()
export class CisternaService {
  constructor(
    @InjectRepository(CisternaSensorReading, 'sensors')
    private readonly sensorsRepository: Repository<CisternaSensorReading>,
  ) { }
}


@Injectable()
export class CisternaReadingsService {
  constructor(
    @InjectRepository(CisternaSensorReading, 'sensors')
    private readonly sensorReadingsRepository: Repository<CisternaSensorReading>,
  ) { }

  async createOne(createSensorReadingDto: CreateSensorDto): Promise<string> {
    const sensorReading = new CisternaSensorReading();
    sensorReading.level = createSensorReadingDto.level;

    await this.sensorReadingsRepository.save(sensorReading);

    return "OK";
  }


  async findAll(): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.sensorReadingsRepository.find()

    const levelArray = sensorReadings.map(row => row.level).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      level: levelArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findLast(): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.sensorReadingsRepository.find({
      order: {
        timestamp: 'DESC', // Ordenamos por timestamp en orden descendente
      },
      take: 20, // Limitamos a las últimas 30 entradas
    })

    const levelArray = sensorReadings.map(row => row.level).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      level: levelArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findLastV2(): Promise<{
    timestamp: Date; // un único valor, no array
    level: number;
  }[]> {

    const sensorReadings = await this.sensorReadingsRepository.find({
      order: {
        timestamp: 'DESC', // Ordenamos por timestamp en orden descendente
      },
      take: 20, // Limitamos a las últimas 30 entradas
    })

    //const tempArray = sensorReadings.map(row => row.temp).reverse();;
    //const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    //const formattedResult = {
    //  temp: tempArray,
    //  timestamp: timestampArray
    //};

    return sensorReadings
      .map(reading => ({
        timestamp: new Date(reading.timestamp),
        level:reading.level, // Aseguramos que sea number
        //sensor_id: reading.sensor_id
      }))
      .reverse();
  }

  async findInterval(start: Date, end: Date): Promise<ReadSensorReadingDto> {
    //console.log("Start: ",start)
    //console.log("End: ",end)
    const sensorReadings = await this.sensorReadingsRepository.find({
      where: {
        timestamp: Between(start, end),
      },
      order: {
        timestamp: 'DESC',
      },
      //take: 30, 
    })

    const levelArray = sensorReadings.map(row => row.level).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      level: levelArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findIntervalV2(start: Date, end: Date): Promise<{
    timestamp: Date; // un único valor, no array
    level: number;
  }[]> {
    //console.log("Start: ",start)
    //console.log("End: ",end)
    const sensorReadings = await this.sensorReadingsRepository.find({
      where: {
        timestamp: Between(start, end),
      },
      order: {
        timestamp: 'DESC',
      },
      //take: 30, 
    })

    return sensorReadings
      .map(reading => ({
        timestamp: new Date(reading.timestamp),
        level: reading.level, // Aseguramos que sea number
        //sensor_id: reading.sensor_id
      }))
      .reverse();
  }
}