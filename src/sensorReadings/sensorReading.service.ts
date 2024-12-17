import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSensorReadingDto } from './dto/create-sensorReading.dto';
import { ReadSensorReadingDto } from './dto/read-sensorReading.dto'
import { SensorReading } from './sensorReading.entity';
import { Between } from 'typeorm';

@Injectable()
export class SensorReadingsService {
  constructor(
    @InjectRepository(SensorReading)
    private readonly SensorReadingsRepository: Repository<SensorReading>,
  ) {}

  create(createSensorReadingDto: CreateSensorReadingDto): Promise<SensorReading> {
    const sensorReading = new SensorReading();
    sensorReading.sensor_id = createSensorReadingDto.id;
    sensorReading.temp = createSensorReadingDto.temp;

    return this.SensorReadingsRepository.save(sensorReading);
  }

  async createMany(createSensorReadingsDto: CreateSensorReadingDto[]): Promise<string> {
    const sensorReadings = createSensorReadingsDto.map(dto => {
      const sensorReading = new SensorReading();
      sensorReading.sensor_id = dto.id;
      sensorReading.temp = dto.temp;
      sensorReading.timestamp = new Date();  // Asumiendo que timestamp es el momento actual
      return sensorReading;
    });

    await this.SensorReadingsRepository.save(sensorReadings)

    return "OK";
  }

  async findAll(): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.SensorReadingsRepository.find()

    const tempArray = sensorReadings.map(row => row.temp).reverse();;
    const timestampArray = sensorReadings.map(row => row.timestamp).reverse();

    const formattedResult = {
      temp: tempArray,
      timestamp: timestampArray
    };

    return formattedResult;
  }

  async findLast(sensorId:number): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.SensorReadingsRepository.find({
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

  async findInterval(sensorId:number,date: {start:Date,end:Date}): Promise<ReadSensorReadingDto> {

    const sensorReadings = await this.SensorReadingsRepository.find({
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

  //findOne(id: number): Promise<SensorReading> {
  //  return this.SensorReadingsRepository.findOneBy({ id: id });
  //}

  //async remove(id: string): Promise<void> {
  //  await this.usersRepository.delete(id);
  //}
}
