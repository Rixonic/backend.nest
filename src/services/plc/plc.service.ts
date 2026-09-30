import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, Like, MoreThanOrEqual } from 'typeorm';
import { Alarms } from '../../plc/plc.entity';

// Límites de paginación de /plc/alarms
export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 1000;

@Injectable()
export class PLCService {
  constructor(
    @InjectRepository(Alarms, 'plc')
    private readonly alarmsRepository: Repository<Alarms>,
  ) { }

  async findAll(opts: { limit: number; since?: Date }): Promise<Alarms[]> {
    return this.alarmsRepository.find({
      where: {
        source: Not(Like('PLC_Temperatura%')),
        // Solo filtra por fecha si se pidió `since`
        ...(opts.since ? { e3TimeStamp: MoreThanOrEqual(opts.since) } : {}),
      },
      order: { e3TimeStamp: 'DESC' },
      take: opts.limit,
    });
  }
}
