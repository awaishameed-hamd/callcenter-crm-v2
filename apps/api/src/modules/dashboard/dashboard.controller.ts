import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('stats')
  stats(
    @CurrentUser() actor: any,
    @Query('period') period?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.dashboard.stats(actor, period ?? 'weekly', fromDate, toDate)
  }
}
