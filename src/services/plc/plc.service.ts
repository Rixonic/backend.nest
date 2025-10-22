import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alarms } from 'src/plc/plc.entity';
import { Not, Like } from 'typeorm';

@Injectable()
export class PLCService {
  constructor(
    @InjectRepository(Alarms, 'plc')
    private readonly alarmsRepository: Repository<Alarms>,
  ) { }

  async findAll(): Promise<Alarms[]> {
    const response = await this.alarmsRepository.find({
      where: {
        source: Not(Like('PLC_Temperatura%'))
      },
      order: { e3TimeStamp: 'DESC' },
    });
    //console.log(response[0])

    return response
  }


  
}
