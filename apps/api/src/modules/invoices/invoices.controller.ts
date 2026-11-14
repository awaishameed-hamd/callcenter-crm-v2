import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { InvoicesService } from './invoices.service'
import { InvoiceSchedulerService } from './invoice-scheduler.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

/** Billing & Payments (Invoice Approval, Clients Ledgers, Invoicing Details): Director and Admin. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DIRECTOR)
@Controller('invoices')
export class InvoicesController {
  constructor(private svc: InvoicesService, private scheduler: InvoiceSchedulerService) {}

  @Get()
  list(@Query() q: Record<string, string>) { return this.svc.list(q) }

  @Get('summary')
  summary() { return this.svc.summary() }

  @Get('register')
  register(@Query() q: Record<string, string>) { return this.svc.register(q) }

  @Get('clients')
  clients(@Query('search') search?: string) { return this.svc.clientsWithBalances(search) }

  @Get('ledger/:clientId')
  ledger(@Param('clientId') clientId: string, @Query('from') from?: string, @Query('to') to?: string) { return this.svc.clientLedger(clientId, from, to) }

  @Get('open/:clientId')
  openInvoices(@Param('clientId') clientId: string, @Query('paymentId') paymentId?: string) { return this.svc.openInvoices(clientId, paymentId) }

  @Get('unbilled/:clientId')
  unbilled(@Param('clientId') clientId: string, @Query() q: Record<string, string>) { return this.svc.unbilledSales(clientId, q) }

  @Get('sales/:clientId')
  sales(@Param('clientId') clientId: string, @Query() q: Record<string, string>) { return this.svc.clientSales(clientId, q) }

  @Get('next-cycle/:clientId')
  nextCycle(@Param('clientId') clientId: string) { return this.svc.nextCycleOf(clientId) }

  @Post('receive-payment')
  receivePayment(@CurrentUser() actor: any, @Body() body: Record<string, any>) { return this.svc.receivePayment(body, actor.id) }

  @Get('payments/:clientId')
  clientPayments(@Param('clientId') clientId: string) { return this.svc.clientPayments(clientId) }

  @Post('payments/:paymentId/apply')
  applyPayment(@Param('paymentId') paymentId: string, @Body() body: Record<string, any>) { return this.svc.applyPayment(paymentId, body) }

  @Patch('payments/:paymentId')
  updatePayment(@Param('paymentId') paymentId: string, @Body() body: Record<string, any>) { return this.svc.updatePayment(paymentId, body) }

  @Delete('payments/:paymentId')
  deletePayment(@Param('paymentId') paymentId: string) { return this.svc.deletePayment(paymentId) }

  @Delete('allocations/:allocationId')
  unapply(@Param('allocationId') allocationId: string) { return this.svc.unapplyAllocation(allocationId) }

  @Patch('opening-balance/:clientId')
  openingBalance(@Param('clientId') clientId: string, @Body() body: Record<string, any>) { return this.svc.setOpeningBalance(clientId, body) }

  /** Invoices Due: clients whose billing cycle ended with approved sales still to invoice. */
  @Get('due')
  due() { return this.svc.dueInvoices() }

  /** Run the "invoice due" check now rather than at midnight (sends the notifications). */
  @Post('check-due')
  checkDue() { return this.scheduler.run('manual') }

  @Get(':id')
  getOne(@Param('id') id: string) { return this.svc.getOne(id) }

  @Post()
  create(@CurrentUser() actor: any, @Body() body: Record<string, any>) { return this.svc.create(body, actor.id) }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) { return this.svc.update(id, body) }

  @Post(':id/send')
  send(@Param('id') id: string) { return this.svc.send(id) }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) { return this.svc.cancel(id) }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.remove(id) }
}
