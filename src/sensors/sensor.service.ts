import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSensorDto } from './dto/create-sensor.dto';
import { Sensor } from './sensor.entity';

@Injectable()
export class SensorsService {
  constructor(
    @InjectRepository(Sensor)
    private readonly sensorsRepository: Repository<Sensor>,
  ) {}

  create(createSensorDto: CreateSensorDto): Promise<Sensor> {
    const sensor = new Sensor();
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

  async remove(id: string): Promise<void> {
    await this.sensorsRepository.delete(id);
  }
}
