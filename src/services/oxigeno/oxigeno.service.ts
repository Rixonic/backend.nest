import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  OxygenSensor,
  OxygenReading,
  OxygenLiquidReading,
} from '../../oxigeno/oxigeno.entity';

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

@Injectable()
export class OxygenLiquidService {
  constructor(
    @InjectRepository(OxygenLiquidReading, 'sensors')
    private readonly liquidRepository: Repository<OxygenLiquidReading>,
  ) {}

  /** Persiste una lectura de nivel (el monitor llama cada `liquidCapture`). */
  async create(timestamp: Date, measure: number): Promise<void> {
    const reading = new OxygenLiquidReading();
    reading.timestamp = timestamp;
    reading.measure = measure;
    await this.liquidRepository.save(reading);
  }

  /** Últimas N lecturas de nivel (más antigua primero), para el gráfico. */
  async findLast(): Promise<{ timestamp: Date; measure: number }[]> {
    const readings = await this.liquidRepository.find({
      order: { timestamp: 'DESC' },
      take: 96, // 24 h a una lectura cada 15 min
    });

    return readings.map(toLiquidDto).reverse();
  }

  /** Lecturas de nivel en un rango de tiempo (más antigua primero). */
  async findInterval(
    start: Date,
    end: Date,
  ): Promise<{ timestamp: Date; measure: number }[]> {
    const readings = await this.liquidRepository.find({
      where: { timestamp: Between(start, end) },
      order: { timestamp: 'ASC' },
    });

    return readings.map(toLiquidDto);
  }
}

const toLiquidDto = (reading: OxygenLiquidReading) => ({
  timestamp: new Date(reading.timestamp),
  measure: Number(reading.measure),
});
