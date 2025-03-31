import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  BaseEntity,
} from 'typeorm';
import { NurserySensor, LaboratorySensor, FarmacySensor } from '../sensors/sensor.entity';

export abstract class SensorReading extends BaseEntity {
  @CreateDateColumn({ type: 'timestamp' })
  @PrimaryColumn()
  timestamp: Date; // Clave primaria (parte 1)

  @PrimaryColumn()
  sensor_id: number; // Clave primaria (parte 2)

  @Column('decimal')
  temp: number; // Temperatura registrada
}

@Entity({ name: 'historic', schema: 'enfermeria' })
export class NurserySensorReading extends SensorReading {
  @ManyToOne(() => NurserySensor)
  @JoinColumn({ name: 'sensor_id' }) 
  sensor: NurserySensor;
}

@Entity({ name: 'historic', schema: 'laboratorio' })
export class LaboratorySensorReading extends SensorReading {
  @ManyToOne(() => LaboratorySensor)
  @JoinColumn({ name: 'sensor_id' })
  sensor: LaboratorySensor;
}

@Entity({ name: 'historic', schema: 'farmacia' })
export class FarmacySensorReading extends SensorReading {
  @ManyToOne(() => FarmacySensor)
  @JoinColumn({ name: 'sensor_id' })
  sensor: FarmacySensor;
}
