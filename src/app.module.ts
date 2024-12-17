import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestModule } from './services/test/tests.module';
import { NurseryModule } from './services/enfermeria/nursery.module';
import { LaboratoryModule } from './services/laboratorio/laboratory.module';
import { FarmacyModule } from './services/farmacia/farmacy.module';

const defaultOptions = {
  type: 'postgres',
  port: 5432,
  username: 'user',
  password: 'password',
  database: 'db',
  synchronize: true,
};


@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      username: 'postgres',
      password: 'toor',
      database: 'dbTestSensor',
      autoLoadEntities: true,
      schema: 'public', // Esquema específico
      //synchronize: true,
      name: 'testConnection', // Nombre para identificar la conexión
    }),
    TestModule,
  ],
})
export class AppModule { }
