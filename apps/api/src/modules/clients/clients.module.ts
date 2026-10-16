import { Module } from '@nestjs/common'
import { ClientsController, DidsController } from './clients.controller'
import { ClientsService } from './clients.service'

@Module({
  controllers: [ClientsController, DidsController],
  providers:   [ClientsService],
})
export class ClientsModule {}
