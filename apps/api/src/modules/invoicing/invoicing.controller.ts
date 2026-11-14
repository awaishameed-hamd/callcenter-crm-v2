import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { InvoicingService } from './invoicing.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'

/** The Laravel Revenue Report (expected, confirmed, invoiced). Invoices themselves live in /invoices. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DIRECTOR)
@Controller('invoicing')
export class InvoicingController {
  constructor(private invoicing: InvoicingService) {}

  @Get('revenue-report')
  revenueReport(@Query() q: Record<string, string>) { return this.invoicing.revenueReport(q) }
}
