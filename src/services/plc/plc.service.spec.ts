import { BadRequestException } from '@nestjs/common';
import { PLCService } from './plc.service';
import { PLCController } from './plc.controller';

describe('PLCService.findAll', () => {
  let query: jest.Mock;
  let service: PLCService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    service = new PLCService({ query } as any);
  });

  it('usa TOP, orden DESC y filtro de source sin since', async () => {
    await service.findAll({ limit: 50 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('TOP (@0)');
    expect(sql).toContain("NOT LIKE 'PLC_Temperatura%'");
    expect(sql).toContain('ORDER BY E3TimeStamp DESC');
    expect(sql).not.toContain('OFFSET');
    expect(sql).not.toContain('FETCH');
    expect(sql).not.toContain('@1');
    expect(params).toEqual([50]);
  });

  it('agrega E3TimeStamp >= @1 cuando se da since', async () => {
    const since = new Date('2026-01-01T00:00:00Z');
    await service.findAll({ limit: 10, since });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('E3TimeStamp >= @1');
    expect(sql).toContain('TOP (@0)');
    expect(params).toEqual([10, since]);
  });
});

describe('PLCController.findAll validación', () => {
  let findAll: jest.Mock;
  let controller: PLCController;

  beforeEach(() => {
    findAll = jest.fn().mockResolvedValue([]);
    controller = new PLCController({ findAll } as any);
  });

  it.each([0, 1001])('rechaza limit=%s', (limit) => {
    expect(() => controller.findAll(limit)).toThrow(BadRequestException);
  });

  it('rechaza since inválido', () => {
    expect(() => controller.findAll(undefined, 'garbage')).toThrow(
      BadRequestException,
    );
  });

  it('usa limit por defecto 200', async () => {
    await controller.findAll();
    expect(findAll).toHaveBeenCalledWith({ limit: 200, since: undefined });
  });

  it('pasa since como Date', async () => {
    await controller.findAll(5, '2026-01-01T00:00:00Z');
    expect(findAll).toHaveBeenCalledWith({
      limit: 5,
      since: new Date('2026-01-01T00:00:00Z'),
    });
  });
});
