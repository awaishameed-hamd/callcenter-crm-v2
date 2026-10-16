import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common'
import { Response }       from 'express'
import { ReportsService, ReportFilters } from './reports.service'
import { JwtAuthGuard }   from '../../common/guards/jwt-auth.guard'
import { CurrentUser }    from '../../common/decorators/current-user.decorator'
import { CustomerStatus, Vertical } from '@crm/shared'

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get()
  getReport(
    @CurrentUser() user: any,
    @Query('from')     from?:     string,
    @Query('to')       to?:       string,
    @Query('status')   status?:   CustomerStatus,
    @Query('vertical') vertical?: Vertical,
    @Query('agentId')  agentId?:  string,
    @Query('didId')    didId?:    string,
  ) {
    return this.reports.getReport(user, { from, to, status, vertical, agentId, didId })
  }

  @Get('export')
  async exportCsv(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('from')     from?:     string,
    @Query('to')       to?:       string,
    @Query('status')   status?:   CustomerStatus,
    @Query('vertical') vertical?: Vertical,
    @Query('agentId')  agentId?:  string,
    @Query('didId')    didId?:    string,
  ) {
    const csv = await this.reports.exportCsv(user, { from, to, status, vertical, agentId, didId })
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="report-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(csv)
  }
}
