import { Injectable } from '@nestjs/common'
import { PrismaService }  from '../prisma/prisma.service'
import { CustomerStatus, Role } from '@crm/shared'

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(userId: string, role: Role, period: 'daily' | 'weekly' | 'monthly' | 'overall' = 'overall') {
    const from = this.periodStart(period)
    const where: any = from ? { createdAt: { gte: from } } : {}

    if (role === Role.AGENT) where.agentId = userId

    const [total, pending, approved, disapproved, finalApproved, finalDisapproved] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.count({ where: { ...where, status: CustomerStatus.PENDING } }),
      this.prisma.customer.count({ where: { ...where, status: CustomerStatus.APPROVED } }),
      this.prisma.customer.count({ where: { ...where, status: CustomerStatus.DISAPPROVED } }),
      this.prisma.customer.count({ where: { ...where, status: CustomerStatus.FINAL_APPROVED } }),
      this.prisma.customer.count({ where: { ...where, status: CustomerStatus.FINAL_DISAPPROVED } }),
    ])

    const recentWhere = role === Role.AGENT ? { agentId: userId } : {}
    const recent = await this.prisma.customer.findMany({
      where:   recentWhere,
      take:    10,
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { displayName: true, userCode: true } },
        did:   { select: { didCode: true, campaign: true } },
      },
    })

    return { total, pending, approved, disapproved, finalApproved, finalDisapproved, recent }
  }

  // All period boundaries use Asia/Karachi (PKT = UTC+5)
  private periodStart(period: string): Date | null {
    const PKT_OFFSET = 5 * 60 // minutes
    const nowUtcMs   = Date.now()
    const nowPktMs   = nowUtcMs + PKT_OFFSET * 60_000

    const pkt = new Date(nowPktMs)
    const y   = pkt.getUTCFullYear()
    const m   = pkt.getUTCMonth()
    const d   = pkt.getUTCDate()

    // Construct PKT midnight then convert back to UTC
    const pktMidnight = (offsetDays = 0) =>
      new Date(Date.UTC(y, m, d + offsetDays) - PKT_OFFSET * 60_000)

    if (period === 'daily')   return pktMidnight(0)
    if (period === 'weekly')  return pktMidnight(-6)   // last 7 days incl. today
    if (period === 'monthly') return new Date(Date.UTC(y, m, 1) - PKT_OFFSET * 60_000)
    return null
  }
}
