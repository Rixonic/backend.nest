import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Sensores de presión de CO2 (Ramos Mejía, baterías de cilindros). Tabla
 * `co2.sensors` (ya creada en la BD): id/name/sensorId/offset. El `offset` es
 * numeric (admite decimales) y se resta a la presión escalada.
 */
@Entity({ name: 'sensors', schema: 'co2', database: 'sensors' })
export class Co2Sensor extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  sensorId: string;

  @Column('decimal', { default: 0 })
  offset: number;
}

/**
 * Lecturas históricas de presión (bar). Tabla `co2.historic` (ya creada): PK
 * compuesta (timestamp, sensor_id); `timestamp` se genera automáticamente.
 */
@Entity({ name: 'historic', schema: 'co2', database: 'sensors' })
export class Co2Reading extends BaseEntity {
  @CreateDateColumn({ type: 'timestamptz' })
  @PrimaryColumn()
  timestamp: Date; // Clave primaria (parte 1)

  @PrimaryColumn()
  sensor_id: number; // Clave primaria (parte 2)

  @Column('decimal')
  pressure: number; // Presión registrada (bar)
}
