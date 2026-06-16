import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { AppConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { NurseryModule } from './services/enfermeria/nursery.module';
import { LaboratoryModule } from './services/laboratorio/laboratory.module';
import { FarmacyModule } from './services/farmacia/farmacy.module';
import { PLCModule } from './services/plc/plc.module';
import { PdfModule } from './pdf/pdf.module';
import { NurserySensor, LaboratorySensor, FarmacySensor, SystemSensor } from './sensors/sensor.entity';
import { NurserySensorReading, LaboratorySensorReading, FarmacySensorReading, SystemSensorReading } from './sensorReadings/sensorReading.entity';
import { TankSensorReading, CisternaSensorReading } from './agua/agua.entity';
import { Alarms } from './plc/plc.entity';
import { WaterModule } from './services/agua/agua.module';
import { SystemModule } from './services/sistemas/system.module';
import { EventsModule } from './events/events.module';
import { AcquisitionModule } from './acquisition/acquisition.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ElectricalModule } from './electrical/electrical.module';
import { WaterMonitorModule } from './water/water.module';
import { MonitorModule } from './monitor/monitor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    // Conexión a PostgreSQL para los sensores
    TypeOrmModule.forRootAsync({
      name: 'sensors',
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const db = config.get('database', { infer: true }).sensors;
        return {
          name: 'sensors',
          type: 'postgres',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities: [NurserySensor, LaboratorySensor, FarmacySensor, SystemSensor, NurserySensorReading, LaboratorySensorReading, FarmacySensorReading, SystemSensorReading, TankSensorReading, CisternaSensorReading],
          autoLoadEntities: false,
          synchronize: false,
        };
      },
    }),
    // Conexión a SQL Server para las alarmas del PLC
    TypeOrmModule.forRootAsync({
      name: 'plc',
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const db = config.get('database', { infer: true }).plc;
        return {
          name: 'plc',
          type: 'mssql',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          schema: db.schema,
          entities: [Alarms],
          autoLoadEntities: false,
          options: {
            encrypt: false,
            trustServerCertificate: true,
          },
          synchronize: false,
        };
      },
    }),
    PLCModule,
    NurseryModule,
    FarmacyModule,
    SystemModule,
    LaboratoryModule,
    PdfModule,
    WaterModule,
    // Integración de adquisición y alertas (ex Node-RED)
    EventsModule,
    AcquisitionModule,
    MonitoringModule,
    NotificationsModule,
    ElectricalModule,
    WaterMonitorModule,
    MonitorModule,
  ],
})
export class AppModule { }
