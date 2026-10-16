import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Role, ManagerType } from '@crm/shared'
import { AccountingService } from './accounting.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@Injectable()
export class AccountantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const user = ctx.switchToHttp().getRequest().user
    const ok = user?.role === Role.ADMIN || (user?.role === Role.MANAGER && user?.managerType === ManagerType.ACCOUNTANT)
    if (!ok) throw new ForbiddenException('Accounting module access denied.')
    return true
  }
}

@UseGuards(JwtAuthGuard, AccountantGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private acc: AccountingService) {}

  // Chart of accounts
  @Get('accounts')                coaIndex(@Query() q: Record<string, string>) { return this.acc.coaIndex(q) }
  @Post('accounts/load-defaults') loadDefaults() { return this.acc.loadDefaults() }
  @Post('accounts')               coaStore(@Body() b: Record<string, any>) { return this.acc.coaStore(b) }
  @Put('accounts/:id')            coaUpdate(@Param('id') id: string, @Body() b: Record<string, any>) { return this.acc.coaUpdate(id, b) }
  @Get('accounts/:id/balance')    coaBalance(@Param('id') id: string) { return this.acc.coaBalance(id) }

  // Classifications
  @Get('classes')               classIndex() { return this.acc.classIndex() }
  @Post('classes')              classStore(@Body() b: Record<string, any>) { return this.acc.classStore(b) }
  @Put('classes/:id')           classUpdate(@Param('id') id: string, @Body() b: Record<string, any>) { return this.acc.classUpdate(id, b) }
  @Patch('classes/:id/toggle')  classToggle(@Param('id') id: string) { return this.acc.classToggle(id) }
  @Delete('classes/:id')        classDelete(@Param('id') id: string) { return this.acc.classDelete(id) }

  // Parties
  @Get('parties')     partiesIndex(@Query() q: Record<string, string>) { return this.acc.partiesIndex(q) }
  @Post('parties')    partiesStore(@Body() b: Record<string, any>) { return this.acc.partiesStore(b) }
  @Put('parties/:id') partiesUpdate(@Param('id') id: string, @Body() b: Record<string, any>) { return this.acc.partiesUpdate(id, b) }

  // Exchange rates
  @Get('exchange-rates/for-date') rateForDate(@Query('currency') currency?: string, @Query('date') date?: string) { return this.acc.rateForDate(currency, date) }
  @Get('exchange-rates')          ratesIndex() { return this.acc.ratesIndex() }
  @Post('exchange-rates')         ratesStore(@Body() b: Record<string, any>) { return this.acc.ratesStore(b) }

  // Vouchers
  @Get('vouchers')              vouchersIndex(@Query() q: Record<string, string>) { return this.acc.vouchersIndex(q) }
  @Post('vouchers')             vouchersStore(@CurrentUser() u: any, @Body() b: Record<string, any>) { return this.acc.vouchersStore(u.id, b) }
  @Get('vouchers/:id')          vouchersShow(@Param('id') id: string) { return this.acc.vouchersShow(id) }
  @Post('vouchers/:id/reverse') vouchersReverse(@CurrentUser() u: any, @Param('id') id: string) { return this.acc.vouchersReverse(u.id, id) }

  // Ledgers
  @Get('gl') generalLedger(@Query() q: Record<string, string>) { return this.acc.generalLedger(q) }
  @Get('tb') trialBalance(@Query() q: Record<string, string>) { return this.acc.trialBalance(q) }

  // Reports
  @Get('reports/pnl')               pnl(@Query() q: Record<string, string>) { return this.acc.profitAndLoss(q) }
  @Get('reports/balance-sheet')     balanceSheet(@Query() q: Record<string, string>) { return this.acc.balanceSheet(q) }
  @Get('reports/ar-ageing')         arAgeing(@Query() q: Record<string, string>) { return this.acc.arAgeing(q) }
  @Get('reports/cash-flow')         cashFlow(@Query() q: Record<string, string>) { return this.acc.cashFlow(q) }
  @Get('reports/budget-vs-actuals') budgetVsActuals(@Query() q: Record<string, string>) { return this.acc.budgetVsActuals(q) }
  @Post('budgets')                  budgetStore(@Body() b: Record<string, any>) { return this.acc.budgetStore(b) }
}
