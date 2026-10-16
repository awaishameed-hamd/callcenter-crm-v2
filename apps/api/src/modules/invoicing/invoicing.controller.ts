import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { InvoicingService } from './invoicing.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('invoicing')
export class InvoicingController {
  constructor(private invoicing: InvoicingService) {}

  @Get('revenue-report')
  revenueReport(@Query() q: Record<string, string>) { return this.invoicing.revenueReport(q) }

  @Get('customer-balances')
  customerBalances() { return this.invoicing.customerBalances() }

  @Get('pending-invoices')
  pendingInvoices() { return this.invoicing.pendingInvoices() }

  @Post('create-invoice')
  createInvoice(@CurrentUser() actor: any, @Body() body: Record<string, any>) { return this.invoicing.createInvoice(actor.id, body) }

  @Get('invoices')
  invoices(@Query() q: Record<string, string>) { return this.invoicing.invoices(q) }

  @Post('mark-sent/:id')
  markSent(@Param('id') id: string) { return this.invoicing.markSent(id) }

  @Post('mark-received/:id')
  markReceived(@Param('id') id: string, @Body() body: Record<string, any>) { return this.invoicing.markReceived(id, body) }
}
