import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { OxygenSensor, OxygenReading } from '../../oxigeno/oxigeno.entity';

@Injectable()
export class OxygenSensorService {
  constructor(
    @InjectRepository(OxygenSensor, 'sensors')
    private readonly sensorsRepository: Repository<OxygenSensor>,
  ) {}

  findAll(): Promise<OxygenSensor[]> {
    return this.sensorsRepository.find();
  }
}

@Injectable()
export class OxygenReadingsService {
  constructor(
    @InjectRepository(OxygenReading, 'sensors')
    private readonly readingsRepository: Repository<OxygenReading>,
  ) {}

  /** Persiste una lectura por sensor (el monitor llama cada `oxygenPersist`). */
  async createMany(rows: { id: number; pressure: number }[]): Promise<string> {
    const readings = rows.map((row) => {
      const reading = new OxygenReading();
      reading.sensor_id = row.id;
      reading.pressure = row.pressure;
      return reading;
    });

    await this.readingsRepository.save(readings);

    return 'OK';
  }

  /** Últimas N lecturas de un sensor (más antigua primero), para el gráfico. */
  async findLastV2(
    sensorId: number,
  ): Promise<{ timestamp: Date; pressure: number }[]> {
    const readings = await this.readingsRepository.find({
      where: { sensor_id: sensorId },
      order: { timestamp: 'DESC' },
      take: 60,
    });

    return readings
      .map((reading) => ({
        timestamp: new Date(reading.timestamp),
        pressure: Number(reading.pressure),
      }))
      .reverse();
  }

  /** Lecturas de un sensor en un rango de tiempo (más antigua primero). */
  async findIntervalV2(
    sensorId: number,
    start: Date,
    end: Date,
  ): Promise<{ timestamp: Date; pressure: number }[]> {
    const readings = await this.readingsRepository.find({
      where: { sensor_id: sensorId, timestamp: Between(start, end) },
      order: { timestamp: 'DESC' },
    });

    return readings
      .map((reading) => ({
        timestamp: new Date(reading.timestamp),
        pressure: Number(reading.pressure),
      }))
      .reverse();
  }
}
