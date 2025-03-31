import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PdfService } from './pdf.service';

@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('laboratorio/individual')
  async generateTemperatureReport(
    @Body() body: { 
      sensor: any; 
      startDate: Date; 
      endDate: Date; 
      setInterval?: boolean 
    },
    @Res() res: Response,
  ) {
    try {
      const pdf = await this.pdfService.generateTemperatureReport(
        body.sensor,
        new Date(body.startDate),
        new Date(body.endDate),
        body.setInterval,
        "LABORATORIO"
      );

      const fileName = `${body.sensor.codigo}_${body.sensor.labId}(${body.sensor.month})(${body.sensor.year}).pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('X-File-Name', fileName);
      res.send(pdf);
    } catch (error) {
      console.error('Error generando el PDF:', error);
      res.status(500).json({
        message: 'Error al generar el PDF',
        error: error.message,
      });
    }
  }

  @Post('generate')
  async generatePdf(
    @Body() body: { templateName: string; data: any },
    @Res() res: Response,
  ) {
    try {
      const pdf = await this.pdfService.generatePdf(
        body.templateName,
        body.data,
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${body.templateName}.pdf`,
      );
      res.send(pdf);
    } catch (error) {
      res.status(500).json({
        message: 'Error al generar el PDF',
        error: error.message,
      });
    }
  }

  @Post('laboratorio/multiple')
  async generateMultipleTemperatureReports(
    @Body() body: { sensors: any[], startDate: Date, endDate: Date, service: string },
    @Res() res: Response
  ) {
    try {
      const zipBuffer = await this.pdfService.generateMultipleTemperatureReports(
        body.sensors,
        new Date(body.startDate),
        new Date(body.endDate),
        "LABORATORIO"
      );

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="sensors_pdfs.zip"');
      res.status(HttpStatus.OK).send(zipBuffer);
    } catch (error) {
      console.error('Error generating PDFs:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Error generating PDFs',
        error: error.message
      });
    }
  }
} 