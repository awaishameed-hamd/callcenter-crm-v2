import { Module } from '@nestjs/common'
import { DidsController } from './dids.controller'
import { DidsService }    from './dids.service'

@Module({
  controllers: [DidsController],
  providers:   [DidsService],
  exports:     [DidsService],
})
export class DidsModule {}
