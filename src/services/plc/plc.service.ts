import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    // SELECT TOP en vez de take: SQL Server < 2012 no soporta OFFSET/FETCH
    const params: unknown[] = [opts.limit];
    // Solo filtra por fecha si se pidió `since`
    const sinceClause = opts.since ? 'AND E3TimeStamp >= @1' : '';
    if (opts.since) params.push(opts.since);

    const sql = `SELECT TOP (@0)
  E3TimeStamp AS e3TimeStamp, Source AS source, Area AS area,
  FullAlarmSourceName AS fullAlarmSourceName, Message AS message
FROM dbo.Alarms
WHERE Source NOT LIKE 'PLC_Temperatura%'
  ${sinceClause}
ORDER BY E3TimeStamp DESC`;

    return this.alarmsRepository.query(sql, params);
  }
}
