import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alarms } from 'src/plc/plc.entity';

@Injectable()
export class PLCService {
  constructor(
    @InjectRepository(Alarms)
    private readonly PLCRepository: Repository<Alarms>,
  ) { }

  async findAll(): Promise<any> {
    return this.PLCRepository.find({
      order: { e3TimeStamp: 'DESC' },
    });
  }
  
}
