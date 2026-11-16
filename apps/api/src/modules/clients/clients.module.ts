import { Module } from '@nestjs/common'
import { ClientsController, CompaniesController, DidsController } from './clients.controller'
import { ClientsService } from './clients.service'
import { InvoicesModule } from '../invoices/invoices.module'

@Module({
  imports:     [InvoicesModule],   // the opening balance is mirrored into the client's ledger
  controllers: [ClientsController, CompaniesController, DidsController],
  providers:   [ClientsService],
})
export class ClientsModule {}
