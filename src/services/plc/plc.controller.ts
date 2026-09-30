import {
  BadRequestException,
  Controller,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { PLCService, DEFAULT_LIMIT, MAX_LIMIT } from './plc.service';
import { Alarms } from '../../plc/plc.entity';

@Controller('plc')
export class PLCController {
  constructor(
    private readonly PLCService: PLCService,
  ) {}

  @Get('/alarms')
  findAll(
    @Query(
      'limit',
      new ParseIntPipe({
        optional: true,
        exceptionFactory: () =>
          new BadRequestException('limit debe ser un entero'),
      }),
    )
    limit?: number,
    @Query('since') since?: string,
  ): Promise<Alarms[]> {
    const finalLimit = limit ?? DEFAULT_LIMIT;
    if (finalLimit < 1 || finalLimit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit debe estar entre 1 y ${MAX_LIMIT}`,
      );
    }

    let sinceDate: Date | undefined;
    if (since !== undefined) {
      if (isNaN(Date.parse(since))) {
        throw new BadRequestException(
          'since debe ser una fecha ISO válida',
        );
      }
      sinceDate = new Date(since);
    }

    return this.PLCService.findAll({ limit: finalLimit, since: sinceDate });
  }
}
