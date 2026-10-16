import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AttendanceStatus, DayType, Role } from '@prisma/client'
import { ManagerType } from '@crm/shared'
import { UpdateAttendanceDto } from './dto/update-attendance.dto'
import { Actor, manageableRoles as policyRoles, assertCanManage } from '../../common/utils/staff-policy'

const manageableRoles = (a: Actor) => policyRoles(a) as Role[]
// Accountants never appear on attendance screens (same as the Laravel CRM).
const NOT_ACCOUNTANT = { OR: [{ managerType: null }, { managerType: { not: ManagerType.ACCOUNTANT } }] }

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

const INTERNAL_STAFF_ROLES: Role[] = [Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT]

export const DEFAULT_SETTINGS = {
  reporting_time:       '09:00',
  login_time:           '10:00',
  grace_period_minutes: '15',
  cutoff_time:          '18:00',
  auto_mark_on_login:   'true',
  timezone:             'Asia/Karachi',
}

let settingsCache: Record<string, string> | null = null
let settingsCacheAt = 0

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async getSettings(): Promise<Record<string, string>> {
    const now = Date.now()
    if (settingsCache && now - settingsCacheAt < 5 * 60 * 1000) return settingsCache

    const rows = await this.prisma.attendanceSetting.findMany()
    const map: Record<string, string> = { ...DEFAULT_SETTINGS }
    for (const r of rows) map[r.key] = r.value
    settingsCache   = map
    settingsCacheAt = now
    return map
  }

  async updateSetting(key: string, value: string, label?: string) {
    settingsCache = null

    const result = await this.prisma.attendanceSetting.upsert({
      where:  { key },
      update: { value, ...(label ? { label } : {}) },
      create: { key, value, label: label ?? key },
    })

    if (key === 'login_time') {
      const todayUtc = new Date()
      todayUtc.setUTCHours(0, 0, 0, 0)
      await this.prisma.workingDay.updateMany({
        where: { date: { gte: todayUtc } },
        data:  { reportingTimeOverride: value },
      })
    }

    return result
  }

  private getDateInTimezone(tz: string): { dateStr: string; timeStr: string } {
    const now   = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)

    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    return {
      dateStr: `${get('year')}-${get('month')}-${get('day')}`,
      timeStr: `${get('hour')}:${get('minute')}`,
    }
  }

  private minutesDiff(time: string, base: string): number {
    const [th, tm] = time.split(':').map(Number)
    const [bh, bm] = base.split(':').map(Number)
    return (th * 60 + tm) - (bh * 60 + bm)
  }

  async getApplicability() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: INTERNAL_STAFF_ROLES }, isActive: true },
      select: { id: true, displayName: true, userCode: true, role: true, managerType: true, agentType: true, attendanceApplicable: true },
      orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
    })
    const grouped: Record<string, { id: string; displayName: string; userCode: string; role: string; managerType: string | null; agentType: string | null; attendanceApplicable: boolean }[]> = {}
    for (const u of users) {
      if (!grouped[u.role]) grouped[u.role] = []
      grouped[u.role].push(u)
    }
    return grouped
  }

  async setUserApplicability(userId: string, applicable: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data:  { attendanceApplicable: applicable },
      select: { id: true, attendanceApplicable: true },
    })
  }

  async setRoleApplicability(role: Role, applicable: boolean) {
    await this.prisma.user.updateMany({
      where: { role, isActive: true },
      data:  { attendanceApplicable: applicable },
    })
    return { role, attendanceApplicable: applicable }
  }

  async usersOnApprovedLeave(userIds: string[], date: Date): Promise<Set<string>> {
    if (userIds.length === 0) return new Set()
    const leaves = await this.prisma.leaveApplication.findMany({
      where: {
        applicantId: { in: userIds },
        status:      'approved',
        fromDate:    { lte: date },
        toDate:      { gte: date },
      },
      select: { applicantId: true },
    })
    return new Set(leaves.map(l => l.applicantId))
  }

  async isOnApprovedLeave(userId: string, date: Date): Promise<boolean> {
    const found = await this.prisma.leaveApplication.findFirst({
      where: {
        applicantId: userId,
        status:      'approved',
        fromDate:    { lte: date },
        toDate:      { gte: date },
      },
      select: { id: true },
    })
    return !!found
  }

  async autoMarkOnLogin(userId: string, userRole: Role) {
    if (!INTERNAL_STAFF_ROLES.includes(userRole)) return null

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { attendanceApplicable: true } })
    if (!user?.attendanceApplicable) return null

    const settings = await this.getSettings()
    if (settings.auto_mark_on_login !== 'true') return null

    const tz                    = settings.timezone
    const { dateStr, timeStr }  = this.getDateInTimezone(tz)
    const cutoff                = settings.cutoff_time

    if (this.minutesDiff(timeStr, cutoff) > 0) return null

    const today = new Date(dateStr + 'T00:00:00Z')

    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } },
    })
    if (existing) return null

    if (await this.isOnApprovedLeave(userId, today)) {
      await this.prisma.attendance.create({
        data: {
          userId,
          date:           today,
          loginTime:      null,
          status:         AttendanceStatus.LEAVE,
          isLate:         false,
          lateMinutes:    null,
          approvalStatus: 'approved',
          notes:          'Auto-marked from approved leave',
        },
      }).catch(() => null)
      return null
    }

    const workingDay = await this.prisma.workingDay.findUnique({ where: { date: today } })
    const dayOfWeek  = today.getUTCDay()
    const resolvedType = workingDay?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)
    if (resolvedType !== DayType.WORKING_DAY) {
      const satEnabled = settings.saturday_attendance_enabled === 'true'
      const sunEnabled = settings.sunday_attendance_enabled === 'true'
      if (dayOfWeek === 6 && satEnabled) return { isWeekendSkip: true } as const
      if (dayOfWeek === 0 && sunEnabled) return { isWeekendSkip: true } as const
      return null
    }

    const attendanceFrom    = settings.reporting_time
    const officialLoginTime = workingDay?.reportingTimeOverride ?? settings.login_time ?? '10:00'
    const graceMins         = parseInt(settings.grace_period_minutes, 10) || 15

    if (this.minutesDiff(timeStr, attendanceFrom) < 0) return null

    const diffFromLoginTime = this.minutesDiff(timeStr, officialLoginTime)
    const isLate            = diffFromLoginTime > graceMins
    const lateMinutes       = isLate ? diffFromLoginTime - graceMins : null

    const attendance = await this.prisma.attendance.create({
      data: {
        userId,
        workingDayId: workingDay?.id ?? undefined,
        date:         today,
        loginTime:    new Date(),
        status:       isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        isLate,
        lateMinutes,
        approvalStatus: 'pending',
      },
    })

    return {
      date:        dateStr,
      loginTime:   timeStr,
      isLate,
      lateMinutes,
      status:      attendance.status,
    }
  }

  async selfCheckin(userId: string, userRole: Role) {
    if (!INTERNAL_STAFF_ROLES.includes(userRole)) return null

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { attendanceApplicable: true } })
    if (!user?.attendanceApplicable) return null

    const settings = await this.getSettings()
    const tz                   = settings.timezone
    const { dateStr, timeStr } = this.getDateInTimezone(tz)
    const cutoff               = settings.cutoff_time

    if (this.minutesDiff(timeStr, cutoff) > 0) return null

    const today      = new Date(dateStr + 'T00:00:00Z')
    const dayOfWeek  = today.getUTCDay()

    if (dayOfWeek === 6 && settings.saturday_attendance_enabled !== 'true') return null
    if (dayOfWeek === 0 && settings.sunday_attendance_enabled   !== 'true') return null

    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } },
    })
    if (existing) {
      const lt = existing.loginTime
        ? `${String(existing.loginTime.getUTCHours()).padStart(2,'0')}:${String(existing.loginTime.getUTCMinutes()).padStart(2,'0')}`
        : timeStr
      return {
        date:        dateStr,
        loginTime:   lt,
        isLate:      existing.isLate ?? false,
        lateMinutes: existing.lateMinutes,
        status:      existing.status,
      }
    }

    const workingDay = await this.prisma.workingDay.findUnique({ where: { date: today } })

    let officialLoginTime: string
    let graceMins: number

    if (dayOfWeek === 6) {
      officialLoginTime = workingDay?.reportingTimeOverride ?? settings.saturday_login_time ?? settings.login_time ?? '10:00'
      graceMins = parseInt(settings.saturday_grace_period_minutes ?? settings.grace_period_minutes, 10) || 15
    } else if (dayOfWeek === 0) {
      officialLoginTime = workingDay?.reportingTimeOverride ?? settings.sunday_login_time ?? settings.login_time ?? '10:00'
      graceMins = parseInt(settings.sunday_grace_period_minutes ?? settings.grace_period_minutes, 10) || 15
    } else {
      officialLoginTime = workingDay?.reportingTimeOverride ?? settings.login_time ?? '10:00'
      graceMins = parseInt(settings.grace_period_minutes, 10) || 15
    }

    const diffFromLoginTime = this.minutesDiff(timeStr, officialLoginTime)
    const isLate            = diffFromLoginTime > graceMins
    const lateMinutes       = isLate ? diffFromLoginTime - graceMins : null

    const attendance = await this.prisma.attendance.create({
      data: {
        userId,
        workingDayId: workingDay?.id ?? undefined,
        date:         today,
        loginTime:    new Date(),
        status:       isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        isLate,
        lateMinutes,
        approvalStatus: 'pending',
      },
    })

    return {
      date:        dateStr,
      loginTime:   timeStr,
      isLate,
      lateMinutes,
      status:      attendance.status,
    }
  }

  async getMyAttendance(userId: string, month: number, year: number) {
    const startDate = new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00Z`)
    const endDate   = new Date(year, month, 1)

    const records = await this.prisma.attendance.findMany({
      where: { userId, date: { gte: startDate, lt: endDate } },
      orderBy: { date: 'asc' },
    })

    const workingDays = await this.prisma.workingDay.findMany({
      where: { date: { gte: startDate, lt: endDate } },
      orderBy: { date: 'asc' },
    })

    const wdMap  = new Map(workingDays.map(d => [d.date.toISOString().split('T')[0], d]))
    const attMap = new Map(records.map(r => [r.date.toISOString().split('T')[0], r]))

    const daysInMonth = new Date(year, month, 0).getDate()
    const today       = new Date().toISOString().split('T')[0]

    const joinedUser  = await this.prisma.user.findUnique({ where: { id: userId }, select: { dateOfJoining: true } })
    const joinDateStr = joinedUser?.dateOfJoining
      ? new Date(joinedUser.dateOfJoining).toISOString().split('T')[0]
      : null

    const calendar = []
    const summary  = { present: 0, absent: 0, late: 0, leave: 0, weekend: 0, working_days: 0, not_joined: 0 }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr   = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const dayOfWeek = new Date(dateStr).getUTCDay()
      const wd        = wdMap.get(dateStr)
      const att       = attMap.get(dateStr)
      const isUpcoming  = dateStr > today
      const isNotJoined = joinDateStr !== null && dateStr < joinDateStr

      const isHoliday = wd?.dayType === DayType.HOLIDAY
      const isWeekend = wd ? wd.dayType === DayType.WEEKEND : (dayOfWeek === 0 || dayOfWeek === 6)

      let status: string
      if (isNotJoined) {
        status = 'not_joined'
      } else if (isHoliday) {
        status = 'leave'
      } else if (isWeekend) {
        status = 'weekend'
      } else if (isUpcoming) {
        status = 'upcoming'
      } else if (!att) {
        status = 'absent'
      } else if (att.status === AttendanceStatus.LATE) {
        status = 'late'
      } else if (att.status === AttendanceStatus.LEAVE) {
        status = 'leave'
      } else {
        status = 'present'
      }

      if (status === 'present')      summary.present++
      else if (status === 'absent')  summary.absent++
      else if (status === 'late')  { summary.late++; summary.present++ }
      else if (status === 'leave')   summary.leave++
      else if (status === 'weekend') summary.weekend++
      else if (status === 'not_joined') summary.not_joined++

      if (!isNotJoined) {
        const resolvedType = wd?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)
        if (resolvedType === DayType.WORKING_DAY) summary.working_days++
      }

      calendar.push({
        date:            dateStr,
        day_name:        DAY_NAMES[dayOfWeek],
        status,
        login_time:      att?.loginTime
          ? new Date(att.loginTime).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false })
          : null,
        is_late:         att?.isLate ?? false,
        late_minutes:    att?.lateMinutes ?? null,
        approval_status: att?.approvalStatus ?? null,
        manually_edited: att?.editedById != null,
      })
    }

    return { calendar, summary, joining_date: joinDateStr }
  }

  /** Staff the actor may see on attendance screens: their call-center scope, never themselves. */
  private scopeUsers(actor: Actor) {
    return { attendanceApplicable: true, role: { in: manageableRoles(actor) }, id: { not: actor.id }, ...NOT_ACCOUNTANT }
  }

  async pendingApprovalCount(actor: Actor) {
    const roles = manageableRoles(actor)
    if (!roles.length) return 0
    const now = new Date()
    const startDate = new Date(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`)
    const endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const attWhere: any = {
      user:           this.scopeUsers(actor),
      date:           { gte: startDate, lt: endDate },
      approvalStatus: 'pending',
      status:         { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
    }

    const [attCount, leaveCount] = await Promise.all([
      this.prisma.attendance.count({ where: attWhere }),
      this.prisma.leaveApplication.count({ where: { status: 'pending', applicant: { role: { in: roles }, id: { not: actor.id } } } }),
    ])
    return attCount + leaveCount
  }

  async getReport(month: number | null, year: number | null, actor: Actor, targetUserId?: string) {
    const where: any = { user: this.scopeUsers(actor) }
    if (month && year) {
      const startDate = new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00Z`)
      const endDate   = new Date(year, month, 1)
      where.date = { gte: startDate, lt: endDate }
    }

    if (targetUserId) where.userId = targetUserId

    const records = await this.prisma.attendance.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true, role: true, managerType: true, agentType: true, isActive: true, dateOfJoining: true } },
      },
      orderBy: [{ date: 'asc' }, { user: { displayName: 'asc' } }],
    })

    return records.map(r => ({
      id:          r.id,
      userId:      r.userId,
      userName:    r.user.displayName,
      userRole:    r.user.role,
      userType:    r.user.managerType ?? r.user.agentType ?? null,
      isActive:    r.user.isActive,
      joinDate:    r.user.dateOfJoining ? r.user.dateOfJoining.toISOString().split('T')[0] : null,
      date:        r.date.toISOString().split('T')[0],
      loginTime:   r.loginTime
        ? new Date(r.loginTime).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false })
        : null,
      status:      r.status,
      isLate:      r.isLate,
      lateMinutes: r.lateMinutes,
      approvalStatus: r.approvalStatus,
      notes:       r.notes,
    }))
  }

  async getOpeningBalances() {
    return this.prisma.attendanceOpening.findMany({
      select: { userId: true, presents: true, late: true, absents: true, leaves: true, workingDays: true },
    })
  }

  async upsertOpeningBalance(userId: string, dto: { presents: number; late: number; absents: number; leaves: number; workingDays: number }) {
    return this.prisma.attendanceOpening.upsert({
      where:  { userId },
      create: { userId, ...dto },
      update: { ...dto },
    })
  }

  async getDailyAttendance(date: string, actor: Actor) {
    const day       = new Date(date + 'T00:00:00Z')
    const nextDay   = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    const dayOfWeek = day.getUTCDay()

    const users = await this.prisma.user.findMany({
      where:   { ...this.scopeUsers(actor), isActive: true },
      select:  { id: true, displayName: true, role: true, managerType: true, agentType: true },
      orderBy: { displayName: 'asc' },
    })

    const records = await this.prisma.attendance.findMany({
      where: { date: { gte: day, lt: nextDay } },
    })
    const attMap = new Map(records.map(r => [r.userId, r]))

    const workingDay = await this.prisma.workingDay.findUnique({ where: { date: day } })

    const isWeekday    = dayOfWeek !== 0 && dayOfWeek !== 6
    const resolvedType = workingDay?.dayType ?? (isWeekday ? DayType.WORKING_DAY : DayType.WEEKEND)

    return {
      date,
      dayName:     DAY_NAMES[dayOfWeek],
      isWorkingDay: resolvedType === DayType.WORKING_DAY,
      dayType:     resolvedType,
      users: users.map(u => {
        const att = attMap.get(u.id)
        return {
          userId:      u.id,
          displayName: u.displayName,
          role:        u.role,
          roleType:    u.managerType ?? u.agentType ?? null,
          status:      att?.status ?? (resolvedType === DayType.WORKING_DAY ? 'ABSENT' : 'N/A'),
          loginTime:   att?.loginTime
            ? new Date(att.loginTime).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false })
            : null,
          isLate:      att?.isLate ?? false,
          lateMinutes: att?.lateMinutes ?? null,
        }
      }),
    }
  }

  private async assertManages(actor: Actor, targetUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true } })
    if (!target) throw new NotFoundException('Staff member not found')
    assertCanManage(actor, target)
  }

  async createAttendance(userId: string, date: string, dto: UpdateAttendanceDto, actor: Actor) {
    await this.assertManages(actor, userId)
    const editorId = actor.id

    const existing = await this.prisma.attendance.findFirst({ where: { userId, date: new Date(date) } })
    if (existing) return this.updateAttendance(existing.id, dto, actor)

    const data: any = {
      userId,
      date:        new Date(date),
      status:      dto.status ?? 'PRESENT',
      isLate:      dto.isLate ?? false,
      lateMinutes: dto.lateMinutes ?? 0,
      notes:       dto.notes,
      editedById:  editorId,
    }
    if (dto.loginTime) {
      const [h, m] = dto.loginTime.split(':').map(Number)
      const d      = new Date(date)
      d.setUTCHours(h - 5, m, 0, 0)
      data.loginTime = d
    }
    return this.prisma.attendance.create({ data })
  }

  async updateAttendance(id: string, dto: UpdateAttendanceDto, actor: Actor) {
    const att = await this.prisma.attendance.findUnique({ where: { id } })
    if (!att) throw new NotFoundException('Attendance record not found')

    await this.assertManages(actor, att.userId)

    const data: any = { editedById: actor.id }
    if (dto.status !== undefined)      data.status      = dto.status
    if (dto.isLate !== undefined)      data.isLate      = dto.isLate
    if (dto.lateMinutes !== undefined) data.lateMinutes = dto.lateMinutes
    if (dto.notes !== undefined)       data.notes       = dto.notes

    if (dto.loginTime !== undefined) {
      if (dto.loginTime) {
        const [h, m] = dto.loginTime.split(':').map(Number)
        const d      = new Date(att.date)
        d.setUTCHours(h - 5, m, 0, 0)
        data.loginTime = d

        if (dto.status === undefined && dto.isLate === undefined && dto.lateMinutes === undefined) {
          const settings      = await this.getSettings()
          const workingDay    = await this.prisma.workingDay.findUnique({ where: { date: att.date } })
          const dayOfWeek     = att.date.getUTCDay()
          const officialLoginTime = workingDay?.reportingTimeOverride
            ?? (dayOfWeek === 6 ? settings.saturday_login_time : dayOfWeek === 0 ? settings.sunday_login_time : undefined)
            ?? settings.login_time ?? '10:00'
          const graceMins = parseInt(
            (dayOfWeek === 6 ? settings.saturday_grace_period_minutes : dayOfWeek === 0 ? settings.sunday_grace_period_minutes : undefined)
            ?? settings.grace_period_minutes, 10) || 15

          const diffFromLoginTime = this.minutesDiff(dto.loginTime, officialLoginTime)
          const isLate            = diffFromLoginTime > graceMins
          data.status      = isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT
          data.isLate      = isLate
          data.lateMinutes = isLate ? diffFromLoginTime - graceMins : null
        }
      } else {
        data.loginTime = null
        if (dto.status === undefined) data.status = AttendanceStatus.ABSENT
      }
    }

    return this.prisma.attendance.update({ where: { id }, data })
  }

  async backfillAbsent(): Promise<{ created: number }> {
    const settings = await this.getSettings()
    const tz       = settings.timezone ?? 'Asia/Karachi'

    const { dateStr: todayStr } = this.getDateInTimezone(tz)
    const yesterday = new Date(todayStr + 'T00:00:00Z')
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)

    const moduleStart = new Date('2026-01-01T00:00:00Z')
    if (yesterday < moduleStart) return { created: 0 }

    const users = await this.prisma.user.findMany({
      where:  { attendanceApplicable: true, role: { in: INTERNAL_STAFF_ROLES } },
      select: { id: true, createdAt: true, dateOfJoining: true },
    })
    if (users.length === 0) return { created: 0 }

    const userStartMap = new Map(users.map(u => {
      const created = new Date(u.dateOfJoining && u.dateOfJoining > u.createdAt ? u.dateOfJoining : u.createdAt)
      created.setUTCHours(0, 0, 0, 0)
      const start = created > moduleStart ? created : moduleStart
      return [u.id, start]
    }))
    const userIds = users.map(u => u.id)

    const workingDays = await this.prisma.workingDay.findMany({
      where:  { date: { gte: moduleStart, lte: yesterday } },
      select: { date: true, dayType: true, id: true },
    })
    const wdMap = new Map(workingDays.map(w => [w.date.toISOString().split('T')[0], w]))

    const existing = await this.prisma.attendance.findMany({
      where:  { date: { gte: moduleStart, lte: yesterday }, userId: { in: userIds } },
      select: { userId: true, date: true },
    })
    const existingSet = new Set(
      existing.map(r => `${r.userId}|${r.date.toISOString().split('T')[0]}`)
    )

    type Row = { userId: string; date: Date; workingDayId: string | undefined }
    const toCreate: Row[] = []
    const cursor = new Date(moduleStart)

    while (cursor <= yesterday) {
      const dateStr   = cursor.toISOString().split('T')[0]
      const dayOfWeek = cursor.getUTCDay()
      const wd        = wdMap.get(dateStr)
      const resolved  = wd?.dayType ?? (dayOfWeek !== 0 && dayOfWeek !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)

      if (resolved === DayType.WORKING_DAY) {
        const dateObj = new Date(cursor)
        for (const user of users) {
          const userStart = userStartMap.get(user.id)!
          if (dateObj < userStart) continue
          if (!existingSet.has(`${user.id}|${dateStr}`)) {
            toCreate.push({ userId: user.id, date: dateObj, workingDayId: wd?.id })
          }
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    if (toCreate.length === 0) return { created: 0 }

    const CHUNK = 200
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      await this.prisma.attendance.createMany({
        data: toCreate.slice(i, i + CHUNK).map(r => ({
          userId:         r.userId,
          workingDayId:   r.workingDayId ?? null,
          date:           r.date,
          loginTime:      null,
          status:         AttendanceStatus.ABSENT,
          isLate:         false,
          lateMinutes:    null,
          approvalStatus: 'pending',
        })),
        skipDuplicates: true,
      })
    }

    return { created: toCreate.length }
  }

  async approveAttendance(id: string, actor: Actor, approve: boolean) {
    const att = await this.prisma.attendance.findUnique({ where: { id } })
    if (!att) throw new NotFoundException('Attendance record not found')
    await this.assertManages(actor, att.userId)

    return this.prisma.attendance.update({
      where: { id },
      data: {
        approvalStatus: approve ? 'approved' : 'rejected',
        approvedById:   actor.id,
        approvedAt:     new Date(),
        ...(approve ? {} : { status: AttendanceStatus.ABSENT, isLate: false, lateMinutes: null }),
      },
    })
  }
}
