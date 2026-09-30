import { BadRequestException } from '@nestjs/common';
import { MoreThanOrEqual } from 'typeorm';
import { PLCService } from './plc.service';
import { PLCController } from './plc.controller';

describe('PLCService.findAll', () => {
  let find: jest.Mock;
  let service: PLCService;

  beforeEach(() => {
    find = jest.fn().mockResolvedValue([]);
    service = new PLCService({ find } as any);
  });

  it('aplica take, orden DESC y filtro de source sin since', async () => {
    await service.findAll({ limit: 50 });
    const arg = find.mock.calls[0][0];
    expect(arg.take).toBe(50);
    expect(arg.order).toEqual({ e3TimeStamp: 'DESC' });
    expect(arg.where.source).toBeDefined();
    expect(arg.where.e3TimeStamp).toBeUndefined();
  });

  it('agrega e3TimeStamp >= since cuando se da since', async () => {
    const since = new Date('2026-01-01T00:00:00Z');
    await service.findAll({ limit: 10, since });
    const arg = find.mock.calls[0][0];
    expect(arg.where.e3TimeStamp).toEqual(MoreThanOrEqual(since));
    expect(arg.where.source).toBeDefined();
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
