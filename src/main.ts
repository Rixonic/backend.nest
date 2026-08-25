import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

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
