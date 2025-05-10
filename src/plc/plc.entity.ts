import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'Alarms', schema: 'dbo' })
export class Alarms {
  @PrimaryColumn({ name: 'E3TimeStamp', type: 'datetime' })
  e3TimeStamp: Date;

  @Column({ name: 'Source', type: 'nvarchar', length: 255 })
  //@PrimaryColumn({ name: 'Source', type: 'nvarchar', length: 255 })
  source: string;

  @Column({ name: 'Area', type: 'nvarchar', length: 255 })
  area: string;

  @Column({ name: 'FullAlarmSourceName', type: 'nvarchar', length: 255 })
  fullAlarmSourceName: string;

  @Column({ name: 'Message', type: 'nvarchar', length: 255 })
  message: string;
}