import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alarms } from 'src/plc/plc.entity';

@Injectable()
export class PLCService {
  constructor(
    @InjectRepository(Alarms, 'plc')
    private readonly alarmsRepository: Repository<Alarms>,
  ) { }

  async findAll(): Promise<Alarms[]> {
    return this.alarmsRepository.find({
      order: { e3TimeStamp: 'DESC' },
    });
  }
  
}
