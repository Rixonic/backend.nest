import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Sensor } from '../sensors/sensor.entity';

@Entity('historic')
export class SensorReading {
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
