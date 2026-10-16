import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CustomerStatus } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail } from '../../common/utils/validate'
import {
  PKT_TZ, BUSINESS_TZ, todayIn, addDays, weekStart, monthStart, monthEnd,
  dayRangeUtc, dateOnly, fmtDateOnly, isYmd, parseYmd,
} from '../../common/utils/time'

const DEFAULT_CYCLE_DAYS = 7

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
      agent:  { select: { id: true, userCode: true, displayName: true } },
      client: { select: { id: true, companyName: true, didCode: true, rateOfSaleAmount: true, rateType: true } },
    } satisfies Prisma.CustomerInclude

    const [expected, confirmed, items] = await Promise.all([
      this.prisma.customer.findMany({ where: { status: CustomerStatus.APPROVED, ...(createdAt ? { createdAt } : {}) }, include: customerInclude }),
      this.prisma.customer.findMany({ where: { status: CustomerStatus.FINAL_APPROVED, ...(createdAt ? { createdAt } : {}) }, include: customerInclude }),
      this.prisma.invoiceItem.findMany({
        where: {
          invoice: {
            status: { in: ['sent', 'overdue'] },
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
      type === 'agent'    ? { label: c.agent?.displayName ?? 'Unknown Agent', sublabel: c.agent?.userCode ?? '' } :
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

  // ── Customer balances ───────────────────────────────────────────────────────

  async customerBalances() {
    const clients = await this.prisma.client.findMany({ where: { isActive: true } })
    const [confirmed, invoiced] = await Promise.all([
      this.prisma.customer.groupBy({ by: ['clientId'], where: { status: CustomerStatus.FINAL_APPROVED }, _sum: { saleRateAmount: true } }),
      this.prisma.invoice.groupBy({ by: ['clientId'], _sum: { totalAmount: true } }),
    ])
    const conf = new Map(confirmed.map(r => [r.clientId, Number(r._sum.saleRateAmount ?? 0)]))
    const inv  = new Map(invoiced.map(r => [r.clientId, Number(r._sum.totalAmount ?? 0)]))
    const balances = clients
      .map(c => {
        const totalConfirmed = conf.get(c.id) ?? 0
        const totalInvoiced  = inv.get(c.id) ?? 0
        return { clientId: c.id, companyName: c.companyName, didCode: c.didCode, totalConfirmed, totalInvoiced, balanceDue: Math.max(0, totalConfirmed - totalInvoiced) }
      })
      .filter(b => b.totalConfirmed > 0 || b.totalInvoiced > 0)
      .sort((a, b) => b.balanceDue - a.balanceDue)
    return { balances }
  }

  // ── Pending invoices (auto-generated from each client's billing cycle) ─────

  async pendingInvoices() {
    const today = todayIn(PKT_TZ)
    const clients = await this.prisma.client.findMany({ where: { isActive: true } })
    const pending: Record<string, unknown>[] = []

    for (const client of clients) {
      const cycleDays = Math.max(1, client.cycleOfDay ?? DEFAULT_CYCLE_DAYS)
      const firstOnFinal = client.billingStartAfter === 'first_final_approved'

      const firstAt = firstOnFinal
        ? (await this.prisma.customer.findFirst({
            where: { clientId: client.id, status: CustomerStatus.FINAL_APPROVED, finalApprovedAt: { not: null } },
            orderBy: { finalApprovedAt: 'asc' }, select: { finalApprovedAt: true },
          }))?.finalApprovedAt
        : (await this.prisma.customer.findFirst({
            where: { clientId: client.id, status: { in: [CustomerStatus.APPROVED, CustomerStatus.FINAL_APPROVED] }, approvedAt: { not: null } },
            orderBy: { approvedAt: 'asc' }, select: { approvedAt: true },
          }))?.approvedAt
      if (!firstAt) continue

      const [invoices, sales] = await Promise.all([
        this.prisma.invoice.findMany({ where: { clientId: client.id }, select: { billingPeriodStart: true, billingPeriodEnd: true } }),
        this.prisma.customer.findMany({
          where: { clientId: client.id, status: CustomerStatus.FINAL_APPROVED, finalApprovedAt: { not: null } },
          select: { finalApprovedAt: true, saleRateAmount: true },
        }),
      ])
      const invoiced = new Set(invoices.map(i => `${fmtDateOnly(i.billingPeriodStart)}|${fmtDateOnly(i.billingPeriodEnd)}`))
      const salesByDay = sales.map(s => ({ day: todayIn(PKT_TZ, s.finalApprovedAt!), amount: Number(s.saleRateAmount ?? 0) }))

      let cursor = todayIn(PKT_TZ, firstAt)
      for (let i = 0; i < 200; i++) {
        const periodStart = cursor
        const periodEnd   = addDays(cursor, cycleDays - 1)
        if (periodEnd >= today) break
        if (!invoiced.has(`${periodStart}|${periodEnd}`)) {
          const inPeriod = salesByDay.filter(s => s.day >= periodStart && s.day <= periodEnd)
          if (inPeriod.length) {
            pending.push({
              clientId: client.id, companyName: client.companyName, didCode: client.didCode,
              periodStart, periodEnd, salesCount: inPeriod.length,
              subtotal: inPeriod.reduce((s, x) => s + x.amount, 0), cycleDays,
            })
          }
        }
        cursor = addDays(cursor, cycleDays)
      }
    }
    return { pending }
  }

  async createInvoice(actorId: string, b: Record<string, any>) {
    const clientId    = V.str(b.clientId, 'Client', { required: true })!
    const periodStart = V.date(b.periodStart, 'Period start', { required: true })!
    const periodEnd   = V.date(b.periodEnd, 'Period end', { required: true })!
    if (periodEnd < periodStart) fail('Period end must be on or after the period start.')
    const discount    = V.num(b.discount, 'Discount', { min: 0 }) ?? 0
    const adjustment  = V.num(b.adjustment, 'Adjustment') ?? 0
    const dueDate     = V.date(b.paymentReceiptDate, 'Payment receipt date', { required: true })!
    const notes       = V.str(b.notes, 'Notes', { max: 1000 }) ?? null

    if (!(await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) fail('The selected client is invalid.')
    const exists = await this.prisma.invoice.findFirst({
      where: { clientId, billingPeriodStart: dateOnly(periodStart), billingPeriodEnd: dateOnly(periodEnd) },
      select: { id: true },
    })
    if (exists) fail('An invoice already exists for this billing period.')

    const sales = await this.prisma.customer.findMany({
      where: { clientId, status: CustomerStatus.FINAL_APPROVED, finalApprovedAt: dayRangeUtc(periodStart, periodEnd, PKT_TZ) },
    })
    if (!sales.length) fail('No final-approved sales found in this period.')

    const subtotal = sales.reduce((s, c) => s + Number(c.saleRateAmount ?? 0), 0)
    const total = subtotal - discount + adjustment
    const today = todayIn(PKT_TZ)
    const year  = parseYmd(today).y

    const invoice = await this.prisma.$transaction(async tx => {
      const seq = await tx.sequenceCounter.upsert({
        where:  { key: `invoice:${year}` },
        update: { value: { increment: 1 } },
        create: { key: `invoice:${year}`, value: 1 },
      })
      return tx.invoice.create({
        data: {
          invoiceNumber:      `INV-${year}-${String(seq.value).padStart(4, '0')}`,
          clientId,
          billingPeriodStart: dateOnly(periodStart),
          billingPeriodEnd:   dateOnly(periodEnd),
          subtotal, discount, adjustment, totalAmount: total,
          status:      'pending',
          invoiceDate: dateOnly(today),
          dueDate:     dateOnly(dueDate),
          notes,
          createdById: actorId,
          items: {
            create: sales.map(s => ({
              customerId:  s.id,
              description: `${s.firstName} ${s.lastName} (${s.verticalType ?? 'N/A'})`.slice(0, 300),
              rate:        Number(s.saleRateAmount ?? 0),
              quantity:    1,
              amount:      Number(s.saleRateAmount ?? 0),
            })),
          },
        },
      })
    })
    return { invoiceNumber: invoice.invoiceNumber, totalAmount: Number(invoice.totalAmount) }
  }

  async invoices(q: Record<string, string | undefined>) {
    const today = todayIn(PKT_TZ)
    await this.prisma.invoice.updateMany({ where: { status: 'sent', dueDate: { lt: dateOnly(today) } }, data: { status: 'overdue' } })

    const where: Prisma.InvoiceWhereInput = {}
    if (q.status && q.status !== 'all') where.status = q.status
    const range = this.period(q.period ?? 'all', q.fromDate, q.toDate, PKT_TZ)
    if (range) where.invoiceDate = { gte: dateOnly(range.from), lte: dateOnly(range.to) }

    const rows = await this.prisma.invoice.findMany({
      where,
      include: {
        client:    { select: { companyName: true, didCode: true } },
        createdBy: { select: { displayName: true } },
        _count:    { select: { items: true } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    })
    return {
      invoices: rows.map(i => ({
        id: i.id, invoiceNumber: i.invoiceNumber,
        companyName: i.client?.companyName, didCode: i.client?.didCode,
        billingPeriodStart: fmtDateOnly(i.billingPeriodStart), billingPeriodEnd: fmtDateOnly(i.billingPeriodEnd),
        subtotal: Number(i.subtotal), discount: Number(i.discount), adjustment: Number(i.adjustment), totalAmount: Number(i.totalAmount),
        status: i.status, invoiceDate: fmtDateOnly(i.invoiceDate), dueDate: fmtDateOnly(i.dueDate),
        paymentReceivedDate: fmtDateOnly(i.paymentReceivedDate), notes: i.notes,
        itemsCount: i._count.items, createdByName: i.createdBy?.displayName ?? null,
      })),
    }
  }

  private async find(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } })
    if (!inv) throw new NotFoundException('Invoice not found.')
    return inv
  }

  async markSent(id: string) {
    const inv = await this.find(id)
    if (inv.status !== 'pending') fail('Only pending invoices can be marked as sent.')
    await this.prisma.invoice.update({ where: { id }, data: { status: 'sent' } })
    return { message: 'Invoice marked as sent.' }
  }

  async markReceived(id: string, b: Record<string, any>) {
    const date = V.date(b.paymentReceivedDate, 'Payment received date', { required: true })!
    const inv = await this.find(id)
    if (inv.status !== 'sent' && inv.status !== 'overdue') fail('Only sent or overdue invoices can be marked as received.')
    await this.prisma.invoice.update({ where: { id }, data: { status: 'paid', paymentReceivedDate: dateOnly(date) } })
    return { message: 'Payment marked as received.' }
  }
}
