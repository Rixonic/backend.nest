import { Controller, Get } from '@nestjs/common';
import { TemperatureMonitorService } from '../monitoring/temperature-monitor.service';
import { TransferMonitorService } from '../electrical/transfer-monitor.service';
import { WaterMonitorService } from '../water/water-monitor.service';

/**
 * Expone el estado en vivo actual (en memoria) de todos los dominios en una sola
 * llamada. Pensado para el primer render del front (SSR/Server Components de
 * Next): se hace `fetch` del snapshot para pintar con datos al instante y luego
 * el WebSocket (`AlertGateway`) mantiene la UI actualizada.
 */
@Controller('monitor')
export class MonitorController {
  constructor(
    private readonly temperature: TemperatureMonitorService,
    private readonly transfer: TransferMonitorService,
    private readonly water: WaterMonitorService,
  ) {}

  @Get('snapshot')
  snapshot() {
    return {
      temperature: this.temperature.getSnapshot(),
      transfer: this.transfer.getSnapshot(),
      water: this.water.getSnapshot(),
    };
  }
}
