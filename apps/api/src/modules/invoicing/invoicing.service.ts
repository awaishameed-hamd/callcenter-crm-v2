import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CustomerStatus, fullName } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail } from '../../common/utils/validate'
import {
  PKT_TZ, BUSINESS_TZ, todayIn, addDays, weekStart, monthStart, monthEnd,
  dayRangeUtc, dateOnly, fmtDateOnly, isYmd, parseYmd,
} from '../../common/utils/time'

type DateRange = { from: string; to: string } | null

@Injectable()
export class InvoicingService {
  constructor(private prisma: PrismaService) {}

  /** Inclusive calendar-date range for a period key, evaluated in the given zone. */
  private period(period: string | undefined, from: string | undefined, to: string | undefined, tz: string): DateRange {
    const today = todayIn(tz)
    switch (period) {
      case 'today':  return { from: today, to: today }
      case 'week':   { const mon = weekStart(today); return { from: mon, to: addDays(mon, 6) } }
      case 'month':  return { from: monthStart(today), to: monthEnd(today) }
      case 'custom': return isYmd(from) && isYmd(to) ? { from, to } : null
      default:       return null
    }
  }

  // ── Revenue report ──────────────────────────────────────────────────────────

  async revenueReport(q: Record<string, string | undefined>) {
    const type = ['customer', 'agent', 'vertical', 'client'].includes(q.type ?? '') ? q.type! : 'client'
    const range = this.period(q.period ?? 'month', q.fromDate, q.toDate, BUSINESS_TZ)
    const createdAt = range ? dayRangeUtc(range.from, range.to, BUSINESS_TZ) : undefined

    const customerInclude = {
      agent:  { select: { id: true, userCode: true, displayName: true, firstName: true, midName: true, lastName: true } },
      client: { select: { id: true, companyName: true, didCode: true, rateOfSaleAmount: true, rateType: true } },
    } satisfies Prisma.CustomerInclude

    const [expected, confirmed, items] = await Promise.all([
      this.prisma.customer.findMany({ where: { status: CustomerStatus.APPROVED, ...(createdAt ? { createdAt } : {}) }, include: customerInclude }),
      this.prisma.customer.findMany({ where: { status: CustomerStatus.FINAL_APPROVED, ...(createdAt ? { createdAt } : {}) }, include: customerInclude }),
      this.prisma.invoiceItem.findMany({
        where: {
          invoice: {
            status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID', 'PAID'] },   // issued (Billing & Payments)
            ...(range ? { invoiceDate: { gte: dateOnly(range.from), lte: dateOnly(range.to) } } : {}),
          },
        },
        include: { customer: { include: customerInclude } },
      }),
    ])

    type Cust = (typeof expected)[number]
    const key = (c: Cust) =>
      type === 'client'   ? `c_${c.client?.companyName ?? 'none'}` :
      type === 'agent'    ? `a_${c.agentId}` :
      type === 'vertical' ? `v_${c.verticalType ?? 'N/A'}` : `cu_${c.id}`
    const label = (c: Cust) =>
      type === 'client'   ? { label: c.client?.companyName ?? 'Unknown Client', sublabel: c.client?.didCode ?? '' } :
      type === 'agent'    ? { label: (c.agent && fullName(c.agent)) || 'Unknown Agent', sublabel: c.agent?.userCode ?? '' } :
      type === 'vertical' ? { label: c.verticalType ?? 'N/A', sublabel: '' } :
                            { label: `${c.firstName} ${c.lastName}`.trim(), sublabel: c.customerCode ?? '' }

    const map = new Map<string, { label: string; sublabel: string; expected: number; confirmed: number; invoice: number }>()
    const row = (c: Cust) => {
      const k = key(c)
      if (!map.has(k)) map.set(k, { ...label(c), expected: 0, confirmed: 0, invoice: 0 })
      return map.get(k)!
    }
    // Manager-approved sales have no rate snapshot yet, so the client's current fixed rate is the expectation.
    for (const c of expected)  row(c).expected  += Number(c.client?.rateType === 'fixed' ? c.client.rateOfSaleAmount ?? 0 : 0)
    for (const c of confirmed) row(c).confirmed += Number(c.saleRateAmount ?? 0)
    for (const i of items)     row(i.customer).invoice += Number(i.amount)

    return { type, period: q.period ?? 'month', rows: [...map.values()].sort((a, b) => b.confirmed - a.confirmed) }
  }
}
