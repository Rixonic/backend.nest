import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { format, getMonth, getYear } from 'date-fns';
import { inlineAssets, warmUpAssets, TEMPLATES_DIR } from './template-assets';
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
  private browser: puppeteer.Browser | undefined;
  private templatesPath: string;

  /** Tope de espera para `page.close()` antes de descartar el browser. */
  private static readonly CLOSE_TIMEOUT_MS = 5_000;

  constructor(
    private readonly laboratoryService: LaboratoryService,
    private readonly nurseryService: NurseryService,
    private readonly farmacyService: FarmacyService,
  ) {
    // Anclado a __dirname (ver template-assets.ts), no a process.cwd(): el cwd
    // sale de dónde se lanzó el proceso y pm2 lo persiste en su dump, así que
    // un resurrect tras un reboot lo cambia y el fallo aparecería recién en el
    // primer request de PDF.
    this.templatesPath = TEMPLATES_DIR;
  }

  async onModuleInit() {
    warmUpAssets();
    await this.initBrowser();
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

  private async initBrowser() {
    try {
      if (this.browser) {
        await this.browser.close().catch(() => { });
      }

      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // ← Importante para servidores con poca RAM
          // Chrome mantiene un renderer tibio pre-lanzado y lo respawnea cada
          // vez que lo consume: ~150 MB ociosos permanentes por browser.
          '--disable-features=SpareRendererForSitePerProcess',
          '--disable-background-networking',
          '--disable-extensions',
          '--no-first-run',
          '--mute-audio',
        ]
      });

      // launch() abre una about:blank que nadie cierra y que queda como un
      // renderer vivo durante toda la vida del proceso.
      for (const p of await this.browser.pages()) {
        await p.close().catch(() => { });
      }

      console.log('Browser initialized successfully');
    } catch (error) {
      console.error('Error initializing browser:', error);
      throw error;
    }
  }


  private async ensureBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      console.log('Browser disconnected, reinitializing...');
      await this.initBrowser();
    }
  }

  /**
   * Cierra la página garantizando que el `finally` no quede colgado.
   *
   * `page.close()` no acepta timeout y puede no resolver nunca si el renderer
   * quedó trabado. Un `.catch()` no cubre ese caso: una promesa pendiente nunca
   * rechaza, así que el catch no se dispara y el await queda esperando para
   * siempre, con la página viva. Corremos contra un temporizador y, si el
   * cierre pierde, tiramos el browser entero: es lo único que libera el proceso
   * renderer a nivel SO.
   */
  private async closePageSafely(page: puppeteer.Page): Promise<void> {
    let timer: NodeJS.Timeout | undefined;

    const closed = await Promise.race([
      page.close().then(
        () => true,
        (err) => {
          console.error('Error closing page:', err);
          return true;
        },
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), PdfService.CLOSE_TIMEOUT_MS);
      }),
    ]);

    if (timer) clearTimeout(timer);

    if (!closed) {
      console.error('[pdf] page.close() colgado: descartando el browser');
      const dead = this.browser;
      this.browser = undefined; // el próximo ensureBrowser() relanza
      void dead?.close().catch(() => {
        dead?.process()?.kill('SIGKILL');
      });
    }
  }

  async generateTemperatureReport(sensor: any, startDate: Date, endDate: Date, setInterval = false, service: string): Promise<Buffer> {
    let page = null;
    await this.ensureBrowser(); // ← Agregar esto al inicio


    try {
      page = await this.browser.newPage();
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

      let templatePath

      // Leer la plantilla
      if (service == "LABORATORIO") {
        templatePath = path.join(this.templatesPath, 'temperature.html');
      }
      if (service == "FARMACIA") {
        templatePath = path.join(this.templatesPath, 'temperatureFarmacia.html');
      }

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

      // Logos, fuente y Chart.js embebidos: el render no hace ninguna petición
      // de red, así setContent no bloquea esperando a MinIO ni a jsdelivr.
      html = inlineAssets(html);

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
      if (page) { // ← Solo cierra si page existe
        await this.closePageSafely(page);
      }
    }

  }

  async generatePdf(templateName: string, data: Record<string, any>): Promise<Buffer> {
    let page = null; // ← Agregar esto
    await this.ensureBrowser(); // ← Agregar esto al inicio


    try {
      page = await this.browser.newPage();
      // Leer la plantilla HTML
      const templatePath = path.join(this.templatesPath, `${templateName}.html`);
      let html = fs.readFileSync(templatePath, 'utf-8');

      // Reemplazar los valores en la plantilla
      Object.entries(data).forEach(([key, value]) => {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      });

      html = inlineAssets(html);

      // Establecer el contenido HTML
      await page.setContent(html);

      // Generar el PDF
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
      });

      return Buffer.from(pdf);
    } finally {
      if (page) { // ← Agregar esta verificación
        await this.closePageSafely(page);
      }
    }
  }

  async generateMultipleTemperatureReports(sensors: any[], startDate: Date, endDate: Date, service: string): Promise<Buffer> {

    // Sufijo único: 'ddMMyyyyHHmmss' tiene resolución de segundo, así que dos
    // requests concurrentes se pisaban el zip (que además tenía nombre fijo).
    const stamp = `${format(new Date(), 'ddMMyyyyHHmmss')}_${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = path.join(process.cwd(), 'temp_pdfs_' + stamp);
    const zipPath = path.join(process.cwd(), `sensors_pdfs_${stamp}.zip`);

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

      // Un `throw` dentro del handler de 'error' NO lo atrapa el try/catch de
      // afuera: sale como uncaughtException y mata el proceso. Lo canalizamos
      // por el reject de la promesa que ya estábamos esperando.
      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        output.on('error', reject);
        archive.on('error', reject);
        archive.on('warning', (err) => console.warn('archiver warning:', err));

        archive.pipe(output);
        archive.directory(outputDir, false);
        archive.finalize().catch(reject);
      });

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