import { Module } from '@nestjs/common'
import { CustomersController } from './customers.controller'
import { CustomersService }    from './customers.service'
import { FinalBatchController } from './final-batch.controller'
import { FinalBatchService }    from './final-batch.service'

@Module({
  controllers: [CustomersController, FinalBatchController],
  providers:   [CustomersService, FinalBatchService],
})
export class CustomersModule {}
