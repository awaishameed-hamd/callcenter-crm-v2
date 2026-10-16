import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CustomerStatus, Role } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import {
  BUSINESS_TZ, PKT_TZ, todayIn, addDays, weekStart, monthStart, monthEnd, addMonths,
  dayRangeUtc, parseYmd, zonedToUtc, dayShort, monthShort, isYmd,
} from '../../common/utils/time'

type Actor = { id: string; role: Role }
type Range = { gte: Date; lt: Date }

const APPROVED: CustomerStatus[] = [CustomerStatus.APPROVED, CustomerStatus.FINAL_APPROVED]
const REJECTED: CustomerStatus[] = [CustomerStatus.DISAPPROVED, CustomerStatus.FINAL_DISAPPROVED]

function bucket(status: string): 'approved' | 'rejected' | 'pending' {
  if (APPROVED.includes(status as CustomerStatus)) return 'approved'
  if (REJECTED.includes(status as CustomerStatus)) return 'rejected'
  return 'pending'
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /** Period boundaries on the US business day (see BUSINESS_TZ). Defaults to this week, as in Laravel. */
  private periodRange(period: string, from?: string, to?: string): Range {
    const today = todayIn(BUSINESS_TZ)
    if (period === 'daily')   return dayRangeUtc(today, today, BUSINESS_TZ)
    if (period === 'monthly') return dayRangeUtc(monthStart(today), monthEnd(today), BUSINESS_TZ)
    if (period === 'custom' && isYmd(from) && isYmd(to)) return dayRangeUtc(from, to, BUSINESS_TZ)
    const mon = weekStart(today)
    return dayRangeUtc(mon, addDays(mon, 6), BUSINESS_TZ)
  }

  async stats(actor: Actor, period = 'weekly', fromDate?: string, toDate?: string) {
    const scope: Prisma.CustomerWhereInput = actor.role === Role.AGENT ? { agentId: actor.id } : {}
    const range = this.periodRange(period, fromDate, toDate)
    const where: Prisma.CustomerWhereInput = { ...scope, createdAt: range }

    const byStatus = await this.prisma.customer.groupBy({ by: ['status'], where, _count: { _all: true } })
    const n = (s: CustomerStatus) => byStatus.find(r => r.status === s)?._count._all ?? 0
    const total    = byStatus.reduce((s, r) => s + r._count._all, 0)
    const approved = n(CustomerStatus.APPROVED) + n(CustomerStatus.FINAL_APPROVED)
    const pending  = n(CustomerStatus.PENDING)
    const rejected = n(CustomerStatus.DISAPPROVED) + n(CustomerStatus.FINAL_DISAPPROVED) + n(CustomerStatus.AGENT_REJECTED)

    const [trend, hourlyTrend, leaderboard, saleTypePie, clientPie, monthlyTrend, cancellationPie, verticalPie] = await Promise.all([
      this.dailyTrend(actor),
      this.hourlyTrend(actor),
      this.leaderboard(range),
      this.saleTypePie(where),
      this.clientPie(where, actor.role),
      this.monthlyTrend(actor),
      this.cancellationPie(where),
      this.verticalPie(where),
    ])

    return {
      stats: {
        total, approved, pending, rejected,
        approvedByManager:  n(CustomerStatus.APPROVED),
        approvedByDirector: n(CustomerStatus.FINAL_APPROVED),
        pendingAtManager:   n(CustomerStatus.PENDING),
        pendingAtDirector:  n(CustomerStatus.APPROVED),
        rejectedByAgent:    n(CustomerStatus.AGENT_REJECTED),
        rejectedByManager:  n(CustomerStatus.DISAPPROVED),
        rejectedByDirector: n(CustomerStatus.FINAL_DISAPPROVED),
      },
      approvalRate: { rate: total > 0 ? Math.round((approved / total) * 100) : 0, approved, pending, rejected, total },
      trend, hourlyTrend, leaderboard, saleTypePie, clientPie, monthlyTrend, cancellationPie, verticalPie,
    }
  }

  private agentFilter(actor: Actor) {
    return actor.role === Role.AGENT ? Prisma.sql`AND "agentId" = ${actor.id}` : Prisma.empty
  }

  private async dailyTrend(actor: Actor) {
    const today = todayIn(BUSINESS_TZ)
    const first = addDays(today, -6)
    const range = dayRangeUtc(first, today, BUSINESS_TZ)
    const rows = await this.prisma.$queryRaw<{ day: string; status: string; cnt: number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TZ}, 'YYYY-MM-DD') AS day,
             status::text AS status, COUNT(*)::int AS cnt
      FROM customers
      WHERE "createdAt" >= ${range.gte} AND "createdAt" < ${range.lt} ${this.agentFilter(actor)}
      GROUP BY 1, 2`
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(first, i)
      const { m, d } = parseYmd(day)
      const t = { date: dayShort(day), full: `${monthShort(m)} ${d}`, submissions: 0, approved: 0, rejected: 0, pending: 0 }
      for (const r of rows.filter(r => r.day === day)) { t.submissions += r.cnt; t[bucket(r.status)] += r.cnt }
      return t
    })
  }

  /** Night shift 7 PM to 4 AM PKT for the current business day. */
  private async hourlyTrend(actor: Actor) {
    const { y, m, d } = parseYmd(todayIn(BUSINESS_TZ))
    const start = zonedToUtc(y, m, d, 19, 0, 0, PKT_TZ)
    const end   = new Date(start.getTime() + 10 * 3_600_000)
    const rows = await this.prisma.$queryRaw<{ hr: number; status: string; cnt: number }[]>`
      SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${PKT_TZ})::int AS hr,
             status::text AS status, COUNT(*)::int AS cnt
      FROM customers
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end} ${this.agentFilter(actor)}
      GROUP BY 1, 2`
    const hours: [number, string][] = [
      [19, '7 PM'], [20, '8 PM'], [21, '9 PM'], [22, '10 PM'], [23, '11 PM'],
      [0, '12 AM'], [1, '1 AM'], [2, '2 AM'], [3, '3 AM'], [4, '4 AM'],
    ]
    return hours.map(([h, label]) => {
      const t = { label, submissions: 0, approved: 0, rejected: 0, pending: 0 }
      for (const r of rows.filter(r => r.hr === h)) { t.submissions += r.cnt; t[bucket(r.status)] += r.cnt }
      return t
    })
  }

  private async monthlyTrend(actor: Actor) {
    const thisMonth = monthStart(todayIn(BUSINESS_TZ))
    const first = addMonths(thisMonth, -11)
    const range = dayRangeUtc(first, monthEnd(thisMonth), BUSINESS_TZ)
    const rows = await this.prisma.$queryRaw<{ ym: string; status: string; cnt: number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TZ}, 'YYYY-MM') AS ym,
             status::text AS status, COUNT(*)::int AS cnt
      FROM customers
      WHERE "createdAt" >= ${range.gte} AND "createdAt" < ${range.lt} ${this.agentFilter(actor)}
      GROUP BY 1, 2`
    return Array.from({ length: 12 }, (_, i) => {
      const ym = addMonths(first, i).slice(0, 7)
      const mine = rows.filter(r => r.ym === ym)
      return {
        month:       monthShort(Number(ym.slice(5, 7))),
        submissions: mine.reduce((s, r) => s + r.cnt, 0),
        approvals:   mine.filter(r => bucket(r.status) === 'approved').reduce((s, r) => s + r.cnt, 0),
      }
    })
  }

  private async leaderboard(range: Range) {
    const rows = await this.prisma.customer.groupBy({
      by: ['agentId', 'status'],
      where: { createdAt: range, agent: { role: Role.AGENT } },
      _count: { _all: true },
    })
    const agg = new Map<string, { total: number; approvals: number }>()
    for (const r of rows) {
      const a = agg.get(r.agentId) ?? { total: 0, approvals: 0 }
      a.total += r._count._all
      if (bucket(r.status) === 'approved') a.approvals += r._count._all
      agg.set(r.agentId, a)
    }
    const agents = await this.prisma.user.findMany({ where: { id: { in: [...agg.keys()] } }, select: { id: true, displayName: true } })
    return agents
      .map(u => {
        const a = agg.get(u.id)!
        return { name: u.displayName, total: a.total, approvals: a.approvals, approvalRate: a.total ? Math.round((a.approvals / a.total) * 100) : 0 }
      })
      .sort((a, b) => b.approvals - a.approvals)
      .slice(0, 10)
  }

  private async clientsById(ids: (string | null)[]) {
    const clients = await this.prisma.client.findMany({
      where: { id: { in: ids.filter((x): x is string => !!x) } },
      select: { id: true, saleType: true, companyName: true, displayName: true, didCode: true },
    })
    return new Map(clients.map(c => [c.id, c]))
  }

  private toPie(counts: Map<string, number>) {
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }

  private async saleTypePie(where: Prisma.CustomerWhereInput) {
    const rows = await this.prisma.customer.groupBy({ by: ['clientId'], where, _count: { _all: true } })
    const clients = await this.clientsById(rows.map(r => r.clientId))
    const counts = new Map<string, number>()
    for (const r of rows) {
      const name = (r.clientId && clients.get(r.clientId)?.saleType) || 'Unknown'
      counts.set(name, (counts.get(name) ?? 0) + r._count._all)
    }
    return this.toPie(counts)
  }

  /** Approved sales by client; agents and managers see DID codes instead of company names. */
  private async clientPie(where: Prisma.CustomerWhereInput, role: Role) {
    const rows = await this.prisma.customer.groupBy({ by: ['clientId'], where: { ...where, status: { in: APPROVED } }, _count: { _all: true } })
    const clients = await this.clientsById(rows.map(r => r.clientId))
    const showCompany = role === Role.ADMIN || role === Role.DIRECTOR
    const counts = new Map<string, number>()
    for (const r of rows) {
      const c = r.clientId ? clients.get(r.clientId) : undefined
      const name = (showCompany ? c?.companyName || c?.displayName || c?.didCode : c?.didCode) || 'Unknown'
      counts.set(name, (counts.get(name) ?? 0) + r._count._all)
    }
    const sorted = this.toPie(counts)
    const top = sorted.slice(0, 6)
    const other = sorted.slice(6).reduce((s, r) => s + r.value, 0)
    return other > 0 ? [...top, { name: 'Other', value: other }] : top
  }

  private async cancellationPie(where: Prisma.CustomerWhereInput) {
    const rows = await this.prisma.customer.groupBy({
      by: ['reason', 'finalNote'],
      where: { ...where, status: { in: REJECTED } },
      _count: { _all: true },
    })
    const counts = new Map<string, number>()
    for (const r of rows) {
      const name = r.reason?.trim() || r.finalNote?.trim()
      if (name) counts.set(name, (counts.get(name) ?? 0) + r._count._all)
    }
    return this.toPie(counts).slice(0, 6)
  }

  private async verticalPie(where: Prisma.CustomerWhereInput) {
    const rows = await this.prisma.customer.groupBy({ by: ['verticalType'], where, _count: { _all: true } })
    const counts = new Map<string, number>()
    for (const r of rows) {
      const name = r.verticalType || 'Other'
      counts.set(name, (counts.get(name) ?? 0) + r._count._all)
    }
    return this.toPie(counts)
  }
}
