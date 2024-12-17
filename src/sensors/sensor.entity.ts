import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sensors')
export class Sensor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  sensorId: string;

  @Column()
  labId: string;

  @Column({ default: 2 })
  max: number;

  @Column({ default: 8 })
  min: number;

  @Column({ default: 3600 })
  time: number;

  @Column({ default: "Heladera" })
  type: string;

  @Column()
  location: string;
}
