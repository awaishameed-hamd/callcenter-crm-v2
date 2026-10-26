import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { ManagerType } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { pushToUser } from '../live/user-events'
import { fmtWhen } from './interviews.service'

const LEAD_MINUTES = 30

/**
 * 30 minutes before a scheduled interview, the HR managers (only them, not Admin or Director)
 * get a popup and a bell notification asking them to call the candidate. Runs every minute; each
 * interview is reminded once (a reschedule clears it so the new time is reminded again).
 */
@Injectable()
export class InterviewRemindersService {
  private logger = new Logger(InterviewRemindersService.name)

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  @Cron('* * * * *')
  async remind() {
    const now = new Date()
    const due = await this.prisma.interview.findMany({
      where: { status: 'SCHEDULED', reminderSentAt: null, scheduledAt: { gt: now, lte: new Date(now.getTime() + LEAD_MINUTES * 60_000) } },
      include: { candidate: { select: { fullName: true, phone: true, altPhone: true } } },
    })
    if (!due.length) return
    const hr = await this.prisma.user.findMany({ where: { isActive: true, role: 'MANAGER', managerType: ManagerType.HR }, select: { id: true } })

    for (const iv of due) {
      // Claim it first so two runs can never remind twice
      const claimed = await this.prisma.interview.updateMany({ where: { id: iv.id, reminderSentAt: null }, data: { reminderSentAt: now } })
      if (!claimed.count) continue
      const minutes = Math.max(1, Math.round((iv.scheduledAt!.getTime() - now.getTime()) / 60_000))
      const title = `Interview in ${minutes} minutes`
      const body = `${iv.candidate.fullName} (${iv.candidate.phone}) for ${iv.position} at ${fmtWhen(iv.scheduledAt!).split(' at ')[1]}. Please call to confirm.`
      const recipients = hr.map(h => h.id)
      for (const userId of recipients) {
        await this.notifications.create({ userId, title, body, type: 'SYSTEM', data: { kind: 'interview_reminder', interviewId: iv.id } }).catch(() => {})
        pushToUser(userId, 'interview_reminder', { id: iv.id, position: iv.position, scheduledAt: iv.scheduledAt, mode: iv.mode, candidate: iv.candidate })
        pushToUser(userId, 'notification', { title, body })
      }
      await this.prisma.interviewEvent.create({ data: { interviewId: iv.id, type: 'REMINDER', note: `30 minute reminder sent to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}` } })
      this.logger.log(`Interview reminder sent for ${iv.id}`)
    }
  }
}
