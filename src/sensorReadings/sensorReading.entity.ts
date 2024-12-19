import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn, BaseEntity } from 'typeorm';
import { Sensor } from '../sensors/sensor.entity';

export abstract class SensorReading extends BaseEntity {
  @CreateDateColumn({ type: 'timestamp' })
  @PrimaryColumn()
  timestamp: Date; // Clave primaria (parte 1)

  @PrimaryColumn()
  sensor_id: number; // Clave primaria (parte 2)

  @Column('decimal')
  temp: number; // Temperatura registrada

  @ManyToOne(() => Sensor)
  @JoinColumn({ name: 'sensor_id' }) 
  sensor: Sensor;
}


@Entity({ name: 'historic', schema: 'enfermeria' })
export class NurserySensorReading extends SensorReading {}

@Entity({ name: 'historic', schema: 'laboratorio' })
export class LaboratorySensorReading extends SensorReading {}

@Entity({ name: 'historic', schema: 'farmacia' })
export class FarmacySensorReading extends SensorReading {}

@Entity({ name: 'historic', schema: 'public' })
export class TestSensorReading extends SensorReading {}