import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NurseryModule } from './services/enfermeria/nursery.module';
import { LaboratoryModule } from './services/laboratorio/laboratory.module';
import { FarmacyModule } from './services/farmacia/farmacy.module';
import { PLCModule } from './services/plc/plc.module';
import { PdfModule } from './pdf/pdf.module';
import { NurserySensor, LaboratorySensor, FarmacySensor } from './sensors/sensor.entity';
import { NurserySensorReading, LaboratorySensorReading, FarmacySensorReading } from './sensorReadings/sensorReading.entity';
import { Alarms } from './plc/plc.entity';

@Module({
  imports: [
    // Conexión a PostgreSQL para los sensores
    TypeOrmModule.forRoot({
      name: 'sensors',
      type: 'postgres',
      host: '192.168.90.219',
      port: 5432,
      username: 'postgres',
      password: 'toor',
      database: 'dbSensors',
      entities: [NurserySensor, LaboratorySensor, FarmacySensor, NurserySensorReading, LaboratorySensorReading, FarmacySensorReading],
      autoLoadEntities: false,
      synchronize: false,
    }),
    // Conexión a SQL Server para las alarmas del PLC
    TypeOrmModule.forRoot({
      name: 'plc',
      type: 'mssql',
      host: '192.168.90.200\\SQLEXPRESS',
      port: 1433,
      username: 'guest',
      password: '1234',
      database: 'E3_HSJD',
      schema: 'dbo',
      entities: [Alarms],
      autoLoadEntities: false,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
      synchronize: false,
    }),
    PLCModule,
    NurseryModule,
    FarmacyModule,
    LaboratoryModule,
    PdfModule
  ],
})
export class AppModule { }
