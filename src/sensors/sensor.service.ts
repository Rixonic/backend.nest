import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSensorDto } from './dto/create-sensor.dto';
import { FarmacySensor, LabroatorySensor, NurserySensor } from './sensor.entity';

//@Injectable()
//export class SensorService {
//  constructor(
//    @InjectRepository(Sensor)
//    private readonly sensorsRepository: Repository<Sensor>,
//  ) {}
//
//  create(createSensorDto: CreateSensorDto): Promise<Sensor> {
//    const sensor = new Sensor();
//    sensor.sensorId = createSensorDto.sensorId;
//    //sensor.lastName = createSensorDto.lastName;
//
//    return this.sensorsRepository.save(sensor);
//  }
//
//  async findAll(): Promise<Sensor[]> {
//    return this.sensorsRepository.find();
//  }
//
//  findOne(id: number): Promise<Sensor> {
//    return this.sensorsRepository.findOneBy({ id: id });
//  }
//
//  async remove(id: string): Promise<void> {
//    await this.sensorsRepository.delete(id);
//  }
//}

class SensorService<T> {
  constructor(private readonly repository: Repository<T>) {}

  async create(entity: T): Promise<T> {
    return this.repository.save(entity);
  }

  async findAll(): Promise<T[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<T | null> {
    return this.repository.findOneBy({ id: id } as any); // Usa `as any` si hay problemas con el tipado.
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}

@Injectable()
export class LabroatoryService extends SensorService<LabroatorySensor> {
  constructor(
    @InjectRepository(LabroatorySensor)
    repository: Repository<LabroatorySensor>,
  ) {
    super(repository);
  }
}

@Injectable()
export class NurseryService extends SensorService<NurserySensor> {
  constructor(
    @InjectRepository(NurserySensor)
    repository: Repository<NurserySensor>,
  ) {
    super(repository);
  }
}

@Injectable()
export class FarmacyService extends SensorService<FarmacySensor> {
  constructor(
    @InjectRepository(FarmacySensor)
    repository: Repository<FarmacySensor>,
  ) {
    super(repository);
  }
}