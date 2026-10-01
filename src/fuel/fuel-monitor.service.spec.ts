import { FuelMonitorService, parseFuelLine } from './fuel-monitor.service';

function build() {
  const flags = { acquisitionEnabled: true, alertsEnabled: true };
  const config = {
    get: (k: string) =>
      k === 'flags'
        ? flags
        : k === 'intervals'
          ? { fuelBroadcast: 5000, fuelStale: 10000 }
          : k === 'fuel'
            ? {
                devices: [
                  {
                    id: 'g2',
                    name: 'Grupo electrógeno G2',
                    host: 'h2',
                    port: 1,
                  },
                  {
                    id: 'g3',
                    name: 'Grupo electrógeno G3',
                    host: 'h3',
                    port: 1,
                  },
                ],
              }
            : {},
  };
  const gateway = { broadcast: jest.fn() };
  const svc = new FuelMonitorService(
    config as never,
    {} as never,
    gateway as never,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priv = svc as any;
  const socket = { destroy: jest.fn() };
  priv.devices[0].socket = socket;
  return { svc, priv, gateway, socket, dev: priv.devices[0] };
}

describe('parseFuelLine', () => {
  it.each([
    ['66', 66],
    ['0', 0],
    ['100', 100],
    ['101', null],
    ['', null],
    ['abc', null],
    [' 57 ', 57],
  ])('%j -> %j', (input, expected) => {
    expect(parseFuelLine(input)).toBe(expected);
  });
});

describe('FuelMonitorService', () => {
  let now: number;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('reensambla líneas partidas y procesa líneas juntas', () => {
    const { svc, priv, dev } = build();
    priv.handleData(dev, '6');
    expect(dev.level).toBeNull();
    priv.handleData(dev, '6\r\n5');
    expect(dev.level).toBe(66);
    priv.handleData(dev, '7\r\n');
    expect(dev.level).toBe(57);

    priv.handleData(dev, '10\r\n20\r\n');
    expect(svc.getSnapshot()[0].level).toBe(20);
  });

  it('descarta tramas inválidas sin lanzar', () => {
    const { priv, dev } = build();
    priv.handleData(dev, 'xx\r\n999\r\n');
    expect(dev.level).toBeNull();
    expect(dev.status).toBe('no-data');
    expect(dev.discarded).toBe(2);
  });

  it('descarta un buffer sin salto de línea que excede el máximo', () => {
    const { priv, dev } = build();
    priv.handleData(dev, '1'.repeat(300));
    expect(dev.buffer).toBe('');
  });

  it('difunde sólo al cambiar el nivel o el estado', () => {
    const { priv, gateway, dev } = build();
    priv.handleData(dev, '66\r\n');
    expect(gateway.broadcast).toHaveBeenCalledTimes(1);
    priv.handleData(dev, '66\r\n');
    expect(gateway.broadcast).toHaveBeenCalledTimes(1);
    priv.handleData(dev, '65\r\n');
    expect(gateway.broadcast).toHaveBeenCalledTimes(2);
    expect(gateway.broadcast).toHaveBeenLastCalledWith(
      'fuel',
      expect.arrayContaining([
        expect.objectContaining({ id: 'g2', level: 65, status: 'ok' }),
      ]),
    );
  });

  it('watchdog: offline conservando el nivel, destruye el socket y se recupera', () => {
    const { svc, priv, gateway, socket, dev } = build();
    const warn = jest.spyOn(priv.logger, 'warn').mockImplementation();
    priv.handleData(dev, '66\r\n');
    gateway.broadcast.mockClear();

    now += 5000;
    priv.checkStale();
    expect(dev.status).toBe('ok');

    now += 6000;
    priv.checkStale();
    expect(dev.status).toBe('offline');
    expect(dev.level).toBe(66);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    // g2 y g3 (nunca tuvo trama) pasan a offline: un warn y un broadcast cada uno
    expect(warn).toHaveBeenCalledTimes(2);
    expect(gateway.broadcast).toHaveBeenCalledTimes(2);
    expect(svc.getSnapshot()[1]).toMatchObject({
      level: null,
      status: 'offline',
    });

    // ya offline: no re-loguea
    now += 1000;
    priv.checkStale();
    expect(warn).toHaveBeenCalledTimes(2);

    priv.handleData(dev, '64\r\n');
    expect(dev.status).toBe('ok');
    expect(svc.getSnapshot()[0]).toMatchObject({ level: 64, status: 'ok' });
  });
});
