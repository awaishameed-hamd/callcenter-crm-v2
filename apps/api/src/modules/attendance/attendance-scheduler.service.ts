import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DayType, AttendanceStatus, Role } from '@prisma/client'
import { PrismaService }    from '../prisma/prisma.service'
import { AttendanceService } from './attendance.service'

const INTERNAL_STAFF_ROLES: Role[] = [Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT]

@Injectable()
export class AttendanceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceSchedulerService.name)

  constructor(
    private prisma:     PrismaService,
    private attendance: AttendanceService,
  ) {}

  async onModuleInit() {
    const flag = await this.prisma.attendanceSetting.findUnique({ where: { key: 'absent_backfill_v3_done' } })
    if (flag) return

    this.logger.log('[BackfillAbsent] Cleaning up incorrectly marked absent records…')

    const wrongRecords = await this.prisma.attendance.findMany({
      where:  { status: 'ABSENT', loginTime: null },
      select: { id: true, date: true, workingDayId: true, userId: true },
    })

    const userRows = await this.prisma.user.findMany({ select: { id: true, createdAt: true } })
    const createdAtMap = new Map(userRows.map(u => [u.id, u.createdAt]))

    const idsToDelete: string[] = []
    for (const r of wrongRecords) {
      const dow = r.date.getUTCDay()

      if (dow === 0 || dow === 6) {
        if (r.workingDayId) {
          const wd = await this.prisma.workingDay.findUnique({ where: { id: r.workingDayId }, select: { dayType: true } })
          if (wd?.dayType === 'WORKING_DAY') continue
        }
        idsToDelete.push(r.id)
        continue
      }

      const userCreated = createdAtMap.get(r.userId)
      if (userCreated) {
        const createdDay = new Date(userCreated)
        createdDay.setUTCHours(0, 0, 0, 0)
        if (r.date < createdDay) {
          idsToDelete.push(r.id)
          continue
        }
      }
    }

    if (idsToDelete.length > 0) {
      await this.prisma.attendance.deleteMany({ where: { id: { in: idsToDelete } } })
      this.logger.log(`[BackfillAbsent] Removed ${idsToDelete.length} wrong absent records`)
    }

    this.logger.log('[BackfillAbsent] Running corrected absent backfill…')
    const { created } = await this.attendance.backfillAbsent()
    this.logger.log(`[BackfillAbsent] Done, ${created} records created`)

    await this.prisma.attendanceSetting.upsert({
      where:  { key: 'absent_backfill_v3_done' },
      update: { value: 'true' },
      create: { key: 'absent_backfill_v3_done', value: 'true', label: 'Absent backfill v3 completed' },
    })
  }

  @Cron('* * * * *')
  async batchMarkEarlyLogins() {
    try {
      const settings = await this.attendance.getSettings()
      if (settings.auto_mark_on_login !== 'true') return

      const tz             = settings.timezone
      const reportingTime  = settings.reporting_time
      const { dateStr, timeStr } = this.nowInTz(tz)

      if (timeStr !== reportingTime) return

      this.logger.log(`[AutoAttendance] Batch marking early logins for ${dateStr} at ${reportingTime} ${tz}`)

      const today      = new Date(dateStr + 'T00:00:00Z')
      const dayOfWeek  = today.getDay()
      const workingDay = await this.prisma.workingDay.findUnique({ where: { date: today } })
      const resolvedType = workingDay?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)
      if (resolvedType !== DayType.WORKING_DAY) {
        this.logger.log('[AutoAttendance] Not a working day, skipping batch mark')
        return
      }

      const [rh, rm]         = reportingTime.split(':').map(Number)
      const todayStartUtc    = this.localToUtc(dateStr, 0,  0,  tz)
      const reportingTimeUtc = this.localToUtc(dateStr, rh, rm, tz)

      const users = await this.prisma.user.findMany({
        where:  { isActive: true, attendanceApplicable: true, role: { in: INTERNAL_STAFF_ROLES } },
        select: { id: true },
      })
      const userIds = users.map(u => u.id)
      if (userIds.length === 0) return

      const alreadyMarked = await this.prisma.attendance.findMany({
        where:  { date: today, userId: { in: userIds } },
        select: { userId: true },
      })
      const markedSet = new Set(alreadyMarked.map(r => r.userId))

      const earlyTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId:    { in: userIds },
          createdAt: { gte: todayStartUtc, lt: reportingTimeUtc },
          expiresAt: { gt: new Date() },
        },
        select:   { userId: true },
        distinct: ['userId'],
      })

      const candidates = earlyTokens.map(t => t.userId).filter(id => !markedSet.has(id))
      const onLeave    = await this.attendance.usersOnApprovedLeave(candidates, today)
      const toMark     = candidates.filter(id => !onLeave.has(id))
      if (toMark.length === 0) {
        this.logger.log('[AutoAttendance] No early-login users to mark')
        return
      }

      const { count } = await this.prisma.attendance.createMany({
        data: toMark.map(userId => ({
          userId,
          workingDayId:   workingDay?.id ?? undefined,
          date:           today,
          loginTime:      reportingTimeUtc,
          status:         AttendanceStatus.PRESENT,
          isLate:         false,
          lateMinutes:    null,
          approvalStatus: 'pending',
        })),
        skipDuplicates: true,
      })

      this.logger.log(`[AutoAttendance] Marked ${count} early-login users as PRESENT`)
    } catch (err) {
      this.logger.error('[AutoAttendance] Batch mark failed', err)
    }
  }

  @Cron('* * * * *')
  async autoMarkAbsent() {
    try {
      const settings = await this.attendance.getSettings()
      if (settings.auto_mark_on_login !== 'true') return

      const tz         = settings.timezone
      const cutoffTime = settings.cutoff_time ?? '23:59'
      const { dateStr, timeStr } = this.nowInTz(tz)

      if (timeStr !== cutoffTime) return

      this.logger.log(`[AutoAbsent] Running absent sweep for ${dateStr}`)

      const today      = new Date(dateStr + 'T00:00:00Z')
      const dayOfWeek  = today.getDay()
      const workingDay = await this.prisma.workingDay.findUnique({ where: { date: today } })
      const resolvedType = workingDay?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)

      if (resolvedType !== DayType.WORKING_DAY) {
        this.logger.log('[AutoAbsent] Not a working day, skipping')
        return
      }

      const users = await this.prisma.user.findMany({
        where:  { isActive: true, attendanceApplicable: true, role: { in: INTERNAL_STAFF_ROLES } },
        select: { id: true },
      })
      const userIds = users.map(u => u.id)
      if (userIds.length === 0) return

      const existing = await this.prisma.attendance.findMany({
        where:  { date: today, userId: { in: userIds } },
        select: { userId: true },
      })
      const markedSet = new Set(existing.map(r => r.userId))

      const unmarked = userIds.filter(id => !markedSet.has(id))
      if (unmarked.length === 0) {
        this.logger.log('[AutoAbsent] All users already have a record today')
        return
      }

      const onLeave  = await this.attendance.usersOnApprovedLeave(unmarked, today)
      const toAbsent = unmarked.filter(id => !onLeave.has(id))
      const toLeave  = unmarked.filter(id => onLeave.has(id))

      const { count } = await this.prisma.attendance.createMany({
        data: [
          ...toAbsent.map(userId => ({
            userId,
            workingDayId:   workingDay?.id ?? undefined,
            date:           today,
            loginTime:      null,
            status:         AttendanceStatus.ABSENT,
            isLate:         false,
            lateMinutes:    null,
            approvalStatus: 'pending',
          })),
          ...toLeave.map(userId => ({
            userId,
            workingDayId:   workingDay?.id ?? undefined,
            date:           today,
            loginTime:      null,
            status:         AttendanceStatus.LEAVE,
            isLate:         false,
            lateMinutes:    null,
            approvalStatus: 'approved',
            notes:          'Auto-marked from approved leave',
          })),
        ],
        skipDuplicates: true,
      })

      this.logger.log(`[AutoAbsent] Marked ${count} records (${toAbsent.length} absent, ${toLeave.length} on leave)`)
    } catch (err) {
      this.logger.error('[AutoAbsent] Sweep failed', err)
    }
  }

  private nowInTz(tz: string): { dateStr: string; timeStr: string } {
    const now   = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, timeStr: `${get('hour')}:${get('minute')}` }
  }

  private localToUtc(dateStr: string, hour: number, minute: number, tz: string): Date {
    const probe  = new Date(`${dateStr}T12:00:00Z`)
    const parts  = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(probe)
    const get    = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10)
    const offsetMins = (get('hour') * 60 + get('minute')) - (12 * 60 + 0)
    const targetMinsUTC = hour * 60 + minute - offsetMins
    return new Date(new Date(dateStr + 'T00:00:00Z').getTime() + targetMinsUTC * 60 * 1000)
  }
}
