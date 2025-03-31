
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('Alarms')
export class Alarms {
  @PrimaryGeneratedColumn()
  id: number;  // Asumiendo que hay una columna de ID primaria

  @Column({ name: 'E3TimeStamp', type: 'datetime' })
  e3TimeStamp: Date;

  @Column({ name: 'Area', type: 'nvarchar', length: 255 })
  area: string;

  @Column({ name: 'FullAlarmSourceName', type: 'nvarchar', length: 255 })
  fullAlarmSourceName: string;

  @Column({ name: 'Message', type: 'nvarchar', length: 255 })
  message: string;

  @Column({ name: 'Source', type: 'nvarchar', length: 255 })
  source: string;
}