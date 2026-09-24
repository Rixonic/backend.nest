import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { Response } from 'express';
import { LiquidMonitorService } from './liquid-monitor.service';

@Controller('oxigeno/liquid')
export class LiquidController {
  constructor(private readonly monitor: LiquidMonitorService) {}

  /** Último snapshot de la cámara, para verificar encuadre/iluminación del LCD. */
  @Get('/image')
  image(@Res() res: Response): void {
    const jpeg = this.monitor.getLastImage();
    if (!jpeg) throw new NotFoundException('Todavía no hay captura');
    res.type('image/jpeg').send(jpeg);
  }
}
