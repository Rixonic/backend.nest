import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';
import { LaboratoryModule } from '../services/laboratorio/laboratory.module';
import { NurseryModule } from '../services/enfermeria/nursery.module';
import { FarmacyModule } from '../services/farmacia/farmacy.module';

@Module({
  imports: [LaboratoryModule, NurseryModule, FarmacyModule],
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {} 