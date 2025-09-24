import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

export abstract class WaterReading extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  
  
  @CreateDateColumn({ type: 'timestamp' })
  @Column()
  timestamp: Date; // Clave primaria (parte 1)

  @Column('decimal')
  level: number; // Temperatura registrada
}

@Entity({ name: 'tanque', schema: 'agua', database: 'sensors' })
export class TankSensorReading extends WaterReading {}

@Entity({ name: 'cisterna', schema: 'agua', database: 'sensors' })
export class CisternaSensorReading extends WaterReading {}
