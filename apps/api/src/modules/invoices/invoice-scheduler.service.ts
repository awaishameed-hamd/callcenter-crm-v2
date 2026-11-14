import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Role } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { pushToUser } from '../live/user-events'
import { InvoicesService } from './invoices.service'
import { fmtShortDate } from '../../common/utils/time'

/**
 * Billing cycles: nothing is invoiced automatically. Every day just after midnight US Eastern (the
 * sales business day), and once when the API starts so a restart catches up, the directors and
 * admins are told which clients' cycles have ended with approved sales still to invoice. They then
 * create the invoice themselves (Invoices Due > Create Invoice).
 */
@Injectable()
export class InvoiceSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvoiceSchedulerService.name)
  private running = false

  constructor(private invoices: InvoicesService, private prisma: PrismaService, private notifications: NotificationsService) {}

  onApplicationBootstrap() { setTimeout(() => this.run('start-up').catch(() => {}), 15_000) }

  @Cron('15 0 * * *', { timeZone: 'America/New_York' })
  daily() { return this.run('daily') }

  async run(why: string) {
    if (this.running) return []
    this.running = true
    try {
      const due = await this.invoices.newlyDueCycles()
      if (due.length) {
        this.logger.log(`Invoices due (${why}): ${due.map(d => d.client).join(', ')}`)
        await this.tell(due)
      }
      return due
    } catch (e) {
      this.logger.error(`Invoice due check failed: ${(e as Error).message}`)
      return []
    } finally {
      this.running = false
    }
  }

  private async tell(due: Awaited<ReturnType<InvoicesService['newlyDueCycles']>>) {
    const people = await this.prisma.user.findMany({ where: { isActive: true, role: { in: [Role.DIRECTOR, Role.ADMIN] } }, select: { id: true } })
    for (const d of due) {
      const title = `Invoice due: ${d.client}`
      const body = `${d.client}'s billing period ${fmtShortDate(d.periodStart)} to ${fmtShortDate(d.periodEnd)} has ended: ${d.sales} approved sale${d.sales === 1 ? '' : 's'} not invoiced yet ($${d.amount.toFixed(2)}). Create the invoice and send it to the client.`
      for (const p of people) {
        await this.notifications.create({ userId: p.id, title, body, type: 'SYSTEM', data: { kind: 'invoice_due', clientId: d.clientId, periodStart: d.periodStart, periodEnd: d.periodEnd } }).catch(() => {})
        pushToUser(p.id, 'notification', { title, body })
      }
    }
  }
}
