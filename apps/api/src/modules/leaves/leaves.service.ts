import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AttendanceStatus, DayType } from '@prisma/client'
import { Role } from '@crm/shared'
import { CreateLeaveDto } from './dto/create-leave.dto'

const CAN_APPROVE: Record<string, string[]> = {
  [Role.DIRECTOR]: [Role.AGENT, Role.MANAGER],
  [Role.ADMIN]:    [Role.AGENT, Role.MANAGER, Role.DIRECTOR],
  [Role.MANAGER]:  [Role.AGENT],
}

// Manager-level leaves can only be approved by DIRECTOR or ADMIN
const DIRECTOR_ADMIN_ONLY: string[] = [Role.MANAGER]

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
      include: { reviewedBy: { select: { displayName: true, role: true } } },
    })
  }

  async getPending(actorRole: string) {
    const approvableRoles = (CAN_APPROVE[actorRole] ?? [])
      .filter(r => actorRole === Role.MANAGER ? !DIRECTOR_ADMIN_ONLY.includes(r) : true)
    if (!approvableRoles.length) return []

    return this.prisma.leaveApplication.findMany({
      where: {
        status:    'pending',
        applicant: { role: { in: approvableRoles as any } },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        applicant:  { select: { displayName: true, role: true, userCode: true } },
        reviewedBy: { select: { displayName: true } },
      },
    })
  }

  async getAll(actorRole: string) {
    const approvableRoles = (CAN_APPROVE[actorRole] ?? [])
      .filter(r => actorRole === Role.MANAGER ? !DIRECTOR_ADMIN_ONLY.includes(r) : true)
    if (!approvableRoles.length) return []

    return this.prisma.leaveApplication.findMany({
      where:   { applicant: { role: { in: approvableRoles as any } } },
      orderBy: { createdAt: 'desc' },
      include: {
        applicant:  { select: { displayName: true, role: true, userCode: true } },
        reviewedBy: { select: { displayName: true } },
      },
    })
  }

  async approve(id: string, actorId: string, actorRole: string) {
    const leave = await this.prisma.leaveApplication.findUnique({
      where:   { id },
      include: { applicant: { select: { role: true } } },
    })
    if (!leave) throw new NotFoundException('Leave application not found')
    if (leave.status !== 'pending') throw new BadRequestException('Already reviewed')

    const approvableRoles = (CAN_APPROVE[actorRole] ?? [])
      .filter(r => actorRole === Role.MANAGER ? !DIRECTOR_ADMIN_ONLY.includes(r) : true)
    if (!approvableRoles.includes(leave.applicant.role as string))
      throw new ForbiddenException('Not authorised to approve this leave')

    const updated = await this.prisma.leaveApplication.update({
      where: { id },
      data:  { status: 'approved', reviewedById: actorId, reviewedAt: new Date() },
    })

    await this.markLeaveAttendance(leave.applicantId, leave.fromDate, leave.toDate)

    return updated
  }

  async reject(id: string, actorId: string, actorRole: string, reason?: string) {
    const leave = await this.prisma.leaveApplication.findUnique({
      where:   { id },
      include: { applicant: { select: { role: true } } },
    })
    if (!leave) throw new NotFoundException('Leave application not found')
    if (leave.status !== 'pending') throw new BadRequestException('Already reviewed')

    const approvableRoles = (CAN_APPROVE[actorRole] ?? [])
      .filter(r => actorRole === Role.MANAGER ? !DIRECTOR_ADMIN_ONLY.includes(r) : true)
    if (!approvableRoles.includes(leave.applicant.role as string))
      throw new ForbiddenException('Not authorised to reject this leave')

    return this.prisma.leaveApplication.update({
      where: { id },
      data:  { status: 'rejected', reviewedById: actorId, reviewedAt: new Date(), rejectionReason: reason ?? null },
    })
  }
}
