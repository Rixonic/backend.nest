import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NurseryModule } from './services/enfermeria/nursery.module';
import { LaboratoryModule } from './services/laboratorio/laboratory.module';
import { FarmacyModule } from './services/farmacia/farmacy.module';
import { PLCModule } from './services/plc/plc.module';

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
    TypeOrmModule.forRoot({
      name: 'BMS.server',
      type: 'mssql', // Tipo de base de datos: SQL Server
      host: '192.168.90.200\\SQLEXPRESS',
      port: 1433, // Puerto por defecto de SQL Server
      username: 'guest', // Usuario de SQL Server
      password: '1234',
      database: 'E3_HSJD',
      autoLoadEntities: true,
      options: {
        encrypt: false, // Configuración adicional para SQL Server
        //trustServerCertificate: true, // Necesario para conexiones locales o de desarrollo
      },
      //synchronize: true,
    }),
    //PLCModule,
    NurseryModule,
    FarmacyModule,
    LaboratoryModule
  ],
})
export class AppModule { }
