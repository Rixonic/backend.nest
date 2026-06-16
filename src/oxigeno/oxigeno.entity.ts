import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Sensores de presión de oxígeno. Tabla `oxigeno.sensors` (ya creada en la BD):
 * solo id/name/sensorId/offset. El `offset` se resta a la presión escalada.
 */
@Entity({ name: 'sensors', schema: 'oxigeno', database: 'sensors' })
export class OxygenSensor extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  sensorId: string;

  @Column({ default: 0 })
  offset: number;
}

/**
 * Lecturas históricas de presión. Tabla `oxigeno.historic` (ya creada): PK
 * compuesta (timestamp, sensor_id); `timestamp` se genera automáticamente.
 */
@Entity({ name: 'historic', schema: 'oxigeno', database: 'sensors' })
export class OxygenReading extends BaseEntity {
  @CreateDateColumn({ type: 'timestamp' })
  @PrimaryColumn()
  timestamp: Date; // Clave primaria (parte 1)

  @PrimaryColumn()
  sensor_id: number; // Clave primaria (parte 2)

  @Column('decimal')
  pressure: number; // Presión registrada
}
