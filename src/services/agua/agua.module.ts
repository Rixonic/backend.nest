import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TanqueService, TanqueReadingsService, CisternaService, CisternaReadingsService } from './agua.service';
import { WaterController } from './agua.controller';
import { TankSensorReading, CisternaSensorReading } from 'src/agua/agua.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TankSensorReading, CisternaSensorReading], 'sensors')
  ],
  providers: [
    TanqueService,
    TanqueReadingsService,
    CisternaService,
    CisternaReadingsService,
  ],
  controllers: [WaterController],
  exports: [TanqueService, TanqueReadingsService, CisternaService, CisternaReadingsService],
})
export class WaterModule {}
