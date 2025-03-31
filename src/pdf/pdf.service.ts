import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { format, getMonth, getYear } from 'date-fns';
import { SensorReadingsService as LaboratoryService } from '../services/laboratorio/laboratory.service';
import { SensorReadingsService as NurseryService } from '../services/enfermeria/nursery.service';
import { SensorReadingsService as FarmacyService } from '../services/farmacia/farmacy.service';
import * as archiver from 'archiver';

const months = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL',
    'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
    'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

@Injectable()
export class PdfService implements OnModuleInit, OnModuleDestroy {
  private browser: puppeteer.Browser;
  private templatesPath: string;

  constructor(
    private readonly laboratoryService: LaboratoryService,
    private readonly nurseryService: NurseryService,
    private readonly farmacyService: FarmacyService,
  ) {
    this.templatesPath = path.join(process.cwd(), 'src', 'pdf', 'templates');
  }

  async onModuleInit() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  private getSensorCode(sensor: any): string {
    switch (sensor.type) {
      case "HELADERA":
        return "LC-F-ANA-03";
      case "FREEZER":
        return "LC-F-ANA-46";
      case "AMBIENTE":
        return "LC-F-ANA-29";
      case "ESTUFA":
        return sensor.labId === "ES-17" ? "LC-F-ANA-30" : "LC-F-ANA-31";
      default:
        return "LC-F-ANA";
    }
  }

  private async getSensorData(sensor: any, startDate: Date, endDate: Date, service: string) {
    switch (service) {
      case "LABORATORIO":
        return this.laboratoryService.findInterval(sensor.id, startDate, endDate);
      case "ENFERMERIA":
        return this.nurseryService.findInterval(sensor.id, startDate, endDate);
      case "FARMACIA":
        return this.farmacyService.findInterval(sensor.id, startDate, endDate);
      default:
        throw new Error('Tipo de sensor no válido');
    }
  }

  async generateTemperatureReport(sensor: any, startDate: Date, endDate: Date, setInterval: boolean = false, service: string): Promise<Buffer> {
    
    const page = await this.browser.newPage();
    
    try {
      const fechaHoy = format(new Date(), 'dd/MM/yyyy');
      
      // Obtener datos del sensor usando el servicio interno
      const response = await this.getSensorData(sensor, startDate, endDate, service);

      let temp: number[];
      let timestamp: Date[];

      if (setInterval) {
        temp = response.temp.filter((_, index) => index % 12 === 0);
        timestamp = response.timestamp.filter((_, index) => index % 12 === 0);
      } else {
        temp = response.temp;
        timestamp = response.timestamp;
      }

      const formattedTimestamps = timestamp.map(timestamp =>
        format(new Date(timestamp), 'dd/MM/yyyy HH:mm:ss')
      );

      // Preparar datos para la plantilla
      const codigo = this.getSensorCode(sensor);
      
      // Leer la plantilla
      const templatePath = path.join(this.templatesPath, 'temperature.html');
      let html = fs.readFileSync(templatePath, 'utf-8');

      // Reemplazar los valores en la plantilla
      const replacements = {
        '{{codigo}}': codigo,
        '{{labId}}': sensor.labId,
        '{{month}}': months[getMonth(startDate)],
        '{{year}}': getYear(startDate).toString(),
        '{{type}}': sensor.type,
        '{{name}}': sensor.name,
        '{{date}}': fechaHoy,
        '{{time}}': JSON.stringify(formattedTimestamps),
        '{{temp}}': JSON.stringify(temp)
      };

      Object.entries(replacements).forEach(([key, value]) => {
        html = html.replace(new RegExp(key, 'g'), String(value));
      });

      // Establecer el contenido HTML
      await page.setContent(html);

      // Generar el PDF
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        landscape: true,
        scale: 0.94,
        margin: {
          top: 24,
          bottom: 24,
          left: 28,
          right: 28
        }
      });


      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
    
  }

  async generatePdf(templateName: string, data: Record<string, any>): Promise<Buffer> {
    const page = await this.browser.newPage();
    
    try {
      // Leer la plantilla HTML
      const templatePath = path.join(this.templatesPath, `${templateName}.html`);
      let html = fs.readFileSync(templatePath, 'utf-8');
      
      // Reemplazar los valores en la plantilla
      Object.entries(data).forEach(([key, value]) => {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      });
      
      // Establecer el contenido HTML
      await page.setContent(html);
      
      // Generar el PDF
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
      });

      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async generateMultipleTemperatureReports(sensors: any[], startDate: Date, endDate: Date, service: string): Promise<Buffer> {
   
    const tempDate = format(new Date(), 'ddMMyyyyHHmmss');
    const outputDir = path.join(process.cwd(), 'temp_pdfs_' + tempDate);
    const zipPath = path.join(process.cwd(), 'sensors_pdfs.zip');

    // Crear directorio temporal si no existe
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    try {
      // Generar PDFs para cada sensor
      for (const sensor of sensors) {
        const pdfBuffer = await this.generateTemperatureReport(sensor, startDate, endDate, true, service);
        const pdfPath = path.join(outputDir, `${this.getSensorCode(sensor)}_${sensor.labId}(${months[getMonth(startDate)]})(${getYear(startDate)}).pdf`);
        fs.writeFileSync(pdfPath, pdfBuffer);
      }

      // Crear archivo ZIP
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('error', (err) => {
        throw err;
      });

      archive.pipe(output);
      archive.directory(outputDir, false);
      await archive.finalize();

      // Esperar a que se complete la escritura del ZIP
      await new Promise((resolve) => output.on('close', resolve));

      // Leer el archivo ZIP
      const zipBuffer = fs.readFileSync(zipPath);

      // Limpiar archivos temporales
      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.unlinkSync(zipPath);

      return zipBuffer;
    } catch (error) {
      // Limpiar archivos temporales en caso de error
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
      throw error;
    }
  }
} 