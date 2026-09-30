import { Co2MonitorService } from './co2-monitor.service';

type Regs = number[];

/** Arma los 11 registros: [v1, v2, mV1, mV2, raw1, raw2, ads, i1, i2, loop1, loop2]. */
const regs = (
  v1: number,
  v2: number,
  o: { ads?: number; loop1?: number; loop2?: number } = {},
): Regs => [
  v1,
  v2,
  0,
  0,
  0,
  0,
  o.ads ?? 1,
  1200,
  1200,
  o.loop1 ?? 0,
  o.loop2 ?? 0,
];

function build(webhook = '', alertsEnabled = true) {
  const flags = { acquisitionEnabled: true, alertsEnabled };
  const config = {
    get: (k: string) =>
      k === 'flags' ? flags : k === 'co2' ? { alertWebhookUrl: webhook } : {},
  };
  const modbus = { readInput: jest.fn() };
  const gateway = { broadcast: jest.fn() };
  const sensors = {
    findAll: jest.fn().mockResolvedValue([
      { id: 2, name: 'Batería B', sensorId: 'co2-b', offset: '1' },
      { id: 1, name: 'Batería A', sensorId: 'co2-a', offset: 0 },
    ]),
  };
  const readings = { createMany: jest.fn().mockResolvedValue('ok') };
  const svc = new Co2MonitorService(
    config as never,
    {} as never,
    modbus as never,
    gateway as never,
    sensors as never,
    readings as never,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priv = svc as any;
  return { svc, priv, modbus, gateway, readings };
}

describe('Co2MonitorService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as never;
  });

  async function setup(webhook = '', alertsEnabled = true) {
    const b = build(webhook, alertsEnabled);
    await b.priv.loadSensors();
    return b;
  }

  it('ordena por id y aplica el offset a lectura válida', async () => {
    const { svc, priv, modbus, gateway } = await setup();
    modbus.readInput.mockResolvedValue(regs(5000, 5300));
    await priv.poll();
    expect(modbus.readInput).toHaveBeenCalledWith('co2', 0, 11);
    expect(svc.getSnapshot()).toEqual([
      {
        sensorId: 'co2-a',
        name: 'Batería A',
        pressure: 50,
        current: 12,
        status: 'ok',
      },
      {
        sensorId: 'co2-b',
        name: 'Batería B',
        pressure: 52,
        current: 12,
        status: 'ok',
      },
    ]);
    expect(gateway.broadcast).toHaveBeenCalledWith('co2', svc.getSnapshot());
  });

  it('falla de lazo deja pressure null y estado', async () => {
    const { svc, priv, modbus } = await setup();
    modbus.readInput.mockResolvedValue(regs(5000, 5300, { loop1: 1, loop2: 2 }));
    await priv.poll();
    const snap = svc.getSnapshot();
    expect(snap[0].pressure).toBeNull();
    expect(snap[0].status).toBe('open-loop');
    expect(snap[1].pressure).toBeNull();
    expect(snap[1].status).toBe('over-range');
  });

  it('ADS = 0 invalida ambos canales', async () => {
    const { svc, priv, modbus } = await setup();
    modbus.readInput.mockResolvedValue(regs(5000, 5300, { ads: 0 }));
    await priv.poll();
    for (const s of svc.getSnapshot()) {
      expect(s.pressure).toBeNull();
      expect(s.status).toBe('adc-error');
    }
  });

  it('error Modbus conserva el último estado', async () => {
    const { svc, priv, modbus } = await setup();
    modbus.readInput.mockRejectedValue(new Error('timeout'));
    await priv.poll();
    expect(svc.getSnapshot()[0].status).toBe('no-data');
  });

  it('persiste sólo sensores con presión válida', async () => {
    const { priv, modbus, readings } = await setup();
    modbus.readInput.mockResolvedValue(regs(5000, 5300, { loop2: 1 }));
    await priv.poll();
    await priv.persist();
    expect(readings.createMany).toHaveBeenCalledWith([{ id: 1, pressure: 50 }]);
  });

  it('alerta una vez bajo 8 bar y se rearma recién sobre 15', async () => {
    const { priv, modbus } = await setup('http://hook.test/x');
    const poll = async (v: number) => {
      modbus.readInput.mockResolvedValue(regs(v, 5000));
      await priv.poll();
      await new Promise((r) => setImmediate(r));
    };
    await poll(700); // 7 bar -> alerta
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://hook.test/x');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      type: 'co2-low-pressure',
      site: 'ramos',
      sensorId: 'co2-a',
      pressure: 7,
      threshold: 8,
    });
    await poll(600); // sigue baja: sin nueva alerta
    await poll(1200); // 12 bar: no rearma (histéresis)
    await poll(700);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await poll(1600); // > 15: rearma
    await poll(700);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no llama al webhook si la URL está vacía', async () => {
    const { priv, modbus } = await setup('');
    modbus.readInput.mockResolvedValue(regs(700, 5000));
    await priv.poll();
    await new Promise((r) => setImmediate(r));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no llama al webhook si las alertas están deshabilitadas', async () => {
    const { priv, modbus } = await setup('http://hook.test/x', false);
    modbus.readInput.mockResolvedValue(regs(700, 5000));
    await priv.poll();
    await new Promise((r) => setImmediate(r));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
