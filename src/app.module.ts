import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestModule } from './services/test/tests.module';
import { NurseryModule } from './services/enfermeria/nursery.module';
import { LaboratoryModule } from './services/laboratorio/laboratory.module';
import { FarmacyModule } from './services/farmacia/farmacy.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      username: 'postgres',
      password: 'toor',
      database: 'dbSensors',
      autoLoadEntities: true,
      //schema: 'public', // Esquema específico
      //synchronize: true,
    }),
    TestModule,
    NurseryModule,
    FarmacyModule,
    LaboratoryModule
  ],
})
export class AppModule { }
