import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// El servidor resuelve AAAA pero no tiene ruta IPv6 ("Network is
// unreachable"); a diferencia de curl, fetch no cae a IPv4 y Telegram queda en
// EFATAL: fetch failed. Preferir IPv4 antes de que se abra cualquier conexión.
setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Sin esto, onModuleDestroy nunca corre ante SIGTERM/SIGINT y el
  // browser.close() de PdfService es código muerto en producción.
  app.enableShutdownHooks();

  app.enableCors({
    origin: '*', // Reemplaza con el origen permitido
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Si necesitas cookies o autenticación
  });

  await app.listen(4125);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
