import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PLCService } from './plc.service';
import { Alarms } from 'src/plc/plc.entity';
import { PLCController } from './plc.controller';


@Module({
  imports: [TypeOrmModule.forFeature([Alarms],'BMS.server')],
  providers: [
    PLCService,  // Registra el servicio de Sensors
  ],
  controllers: [PLCController],
})
export class PLCModule {}
