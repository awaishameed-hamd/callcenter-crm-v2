import { Module } from '@nestjs/common'
import { AccountingController } from './accounting.controller'
import { AccountingService } from './accounting.service'
import { DimensionsController } from './dimensions.controller'
import { DimensionsService } from './dimensions.service'

@Module({
  controllers: [DimensionsController, AccountingController],
  providers:   [AccountingService, DimensionsService],
})
export class AccountingModule {}
