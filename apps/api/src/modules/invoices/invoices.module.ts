import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { InvoicesController } from './invoices.controller'
import { InvoicesService } from './invoices.service'
import { InvoiceSchedulerService } from './invoice-scheduler.service'

@Module({
  imports:     [NotificationsModule],
  controllers: [InvoicesController],
  providers:   [InvoicesService, InvoiceSchedulerService],
  exports:     [InvoicesService],
})
export class InvoicesModule {}
