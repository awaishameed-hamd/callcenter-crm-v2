import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { ReportsService } from './reports.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get()
  list(@CurrentUser() actor: any, @Query() q: Record<string, string>) { return this.reports.list(actor, q) }

  @Get('export')
  async export(@CurrentUser() actor: any, @Query() q: Record<string, string>, @Res() res: Response) {
    const csv = await this.reports.exportCsv(actor, q)
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="report_${stamp}.csv"`)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.send(csv)
  }
}
