import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AttendanceStatus, DayType } from '@prisma/client'
import { CreateLeaveDto } from './dto/create-leave.dto'
import { Actor, leaveRoles, assertCanManage } from '../../common/utils/staff-policy'

function calcDays(from: string, to: string): number {
  const f = new Date(from), t = new Date(to)
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1)
}

@Injectable()
export class LeavesService {
  private readonly logger = new Logger(LeavesService.name)

  constructor(private prisma: PrismaService) {}

  private async markLeaveAttendance(applicantId: string, fromDate: Date, toDate: Date) {
    const dates: Date[] = []
    for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(new Date(d))
    }
    if (dates.length === 0) return

    const workingDays = await this.prisma.workingDay.findMany({
      where:  { date: { gte: dates[0], lte: dates[dates.length - 1] } },
      select: { id: true, date: true, dayType: true },
    })
    const wdMap = new Map(workingDays.map(w => [w.date.toISOString().split('T')[0], w]))

    for (const date of dates) {
      const key = date.toISOString().split('T')[0]
      const wd  = wdMap.get(key)
      const dow = date.getUTCDay()
      const resolved = wd?.dayType ?? (dow !== 0 && dow !== 6 ? DayType.WORKING_DAY : DayType.WEEKEND)
      if (resolved !== DayType.WORKING_DAY) continue

      const data = {
        workingDayId:   wd?.id ?? undefined,
        loginTime:      null,
        status:         AttendanceStatus.LEAVE,
        isLate:         false,
        lateMinutes:    null,
        approvalStatus: 'approved',
        notes:          'Auto-marked from approved leave',
      }
      try {
        await this.prisma.attendance.upsert({
          where:  { userId_date: { userId: applicantId, date } },
          update: data,
          create: { userId: applicantId, date, ...data },
        })
      } catch (e) {
        this.logger.warn(`Could not mark leave attendance for ${key}: ${e}`)
      }
    }
  }

  async apply(applicantId: string, dto: CreateLeaveDto) {
    if (dto.fromDate > dto.toDate)
      throw new BadRequestException('From date must be before or equal to To date')

    return this.prisma.leaveApplication.create({
      data: {
        applicantId,
        leaveType: dto.leaveType,
        fromDate:  new Date(dto.fromDate),
        toDate:    new Date(dto.toDate),
        days:      calcDays(dto.fromDate, dto.toDate),
        reason:    dto.reason,
      },
    })
  }

  async getMyLeaves(applicantId: string) {
    return this.prisma.leaveApplication.findMany({
      where:   { applicantId },
      orderBy: { createdAt: 'desc' },
      include: { reviewedBy: { select: { displayName: true, role: true, managerType: true } } },
    })
  }

  private scope(actor: Actor) {
    return { role: { in: leaveRoles(actor) as any }, id: { not: actor.id } }
  }

  private static readonly APPLICANT = { select: { displayName: true, role: true, userCode: true, managerType: true, agentType: true } }

  async getPending(actor: Actor) {
    if (!leaveRoles(actor).length) return []
    return this.prisma.leaveApplication.findMany({
      where:   { status: 'pending', applicant: this.scope(actor) },
      orderBy: { createdAt: 'asc' },
      include: { applicant: LeavesService.APPLICANT, reviewedBy: { select: { displayName: true } } },
    })
  }

  async getAll(actor: Actor) {
    if (!leaveRoles(actor).length) return []
    return this.prisma.leaveApplication.findMany({
      where:   { applicant: this.scope(actor) },
      orderBy: { createdAt: 'desc' },
      include: { applicant: LeavesService.APPLICANT, reviewedBy: { select: { displayName: true } } },
    })
  }

  private async reviewable(id: string, actor: Actor) {
    const leave = await this.prisma.leaveApplication.findUnique({
      where:   { id },
      include: { applicant: { select: { id: true, role: true } } },
    })
    if (!leave) throw new NotFoundException('Leave application not found')
    if (leave.status !== 'pending') throw new BadRequestException('Already reviewed')
    assertCanManage(actor, leave.applicant, leaveRoles(actor))
    return leave
  }

  async approve(id: string, actor: Actor) {
    const leave = await this.reviewable(id, actor)
    const updated = await this.prisma.leaveApplication.update({
      where: { id },
      data:  { status: 'approved', reviewedById: actor.id, reviewedAt: new Date() },
    })
    await this.markLeaveAttendance(leave.applicantId, leave.fromDate, leave.toDate)
    return updated
  }

  async reject(id: string, actor: Actor, reason?: string) {
    await this.reviewable(id, actor)
    return this.prisma.leaveApplication.update({
      where: { id },
      data:  { status: 'rejected', reviewedById: actor.id, reviewedAt: new Date(), rejectionReason: reason ?? null },
    })
  }
}
