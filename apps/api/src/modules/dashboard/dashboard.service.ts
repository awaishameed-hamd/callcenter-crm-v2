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

  private periodStart(period: string): Date | null {
    const now = new Date()
    if (period === 'daily')   { now.setHours(0,0,0,0); return now }
    if (period === 'weekly')  { now.setDate(now.getDate() - 7); return now }
    if (period === 'monthly') { now.setDate(1); now.setHours(0,0,0,0); return now }
    return null
  }
}
