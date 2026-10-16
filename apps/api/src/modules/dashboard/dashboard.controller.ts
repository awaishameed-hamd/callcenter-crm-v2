import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard }     from '../../common/guards/jwt-auth.guard'
import { CurrentUser }      from '../../common/decorators/current-user.decorator'

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('stats')
  stats(
    @CurrentUser() user: any,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' | 'overall',
  ) {
    return this.dashboard.getStats(user.id, user.role, period ?? 'overall')
  }
}
