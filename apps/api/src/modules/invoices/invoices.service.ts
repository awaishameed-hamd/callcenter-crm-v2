import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CustomerStatus, fullName } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail } from '../../common/utils/validate'
import { BUSINESS_TZ, todayIn, addDays, dayRangeUtc, dateOnly, fmtDateOnly, isYmd, fmtShortDate } from '../../common/utils/time'

// Billing & Payments, argroup's Invoicing ported to the call center, in USD and separate from
// Accounting. What differs from argroup:
//   - An invoice bills a client's FINAL APPROVED sales (one line per sale at its frozen rate).
//   - Nothing is invoiced automatically (user, 2026-11-14): when a client's billing cycle ends the
//     director is told the invoice is due, then picks the client, the dates and the sales to bill.
//   - No retainer / annual contracts and no tax withheld at source; a payment settles an invoice
//     with cash plus an optional discount.
// The money model is argroup's: payments belong to the client, allocations say how much of a
// payment went to which invoice, and the invoice's settled figures are always rebuilt from them.

const BILLABLE = ['SENT', 'OVERDUE', 'PARTIALLY_PAID', 'PAID']          // money really owed
const AWAITING = ['SENT', 'OVERDUE', 'PARTIALLY_PAID']                  // can take a payment
const METHODS  = ['WIRE', 'ACH', 'PAYONEER', 'WISE', 'PAYPAL', 'CHECK', 'CASH', 'OTHER'] as const
const DEFAULT_CYCLE = 30
const DUE_AFTER_DAYS = 7
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0)

type Alloc = { invoiceId: string; amount: number; discount: number }

const CLIENT_SELECT = {
  id: true, companyName: true, didCode: true, campaign: true, rateType: true, rateOfSaleAmount: true,
  cycleOfDay: true, billingStartAfterDays: true, billingStartAfter: true, isActive: true,
  openingBalance: true, openingBalanceDate: true,
} satisfies Prisma.ClientSelect

const PERSON = { select: { id: true, displayName: true, firstName: true, midName: true, lastName: true } }

const INVOICE_INCLUDE = {
  client: { select: CLIENT_SELECT },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      customer: {
        select: {
          id: true, firstName: true, midName: true, lastName: true, phone: true, state: true, verticalType: true,
          createdAt: true, finalApprovedAt: true, submittedAtEst: true, saleDidCode: true,
          agent: PERSON,
        },
      },
    },
  },
  allocations: { orderBy: { createdAt: 'asc' as const }, include: { payment: { include: { recordedBy: PERSON } } } },
  createdBy: PERSON,
} satisfies Prisma.InvoiceInclude

const PAYMENT_INCLUDE = {
  allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, description: true } } } },
  recordedBy: PERSON,
} satisfies Prisma.PaymentInclude

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name)
  constructor(private prisma: PrismaService) {}

  // ── Numbers, dates ─────────────────────────────────────────────────────────

  private async next(prefix: 'INV' | 'PMT', tx: Prisma.TransactionClient = this.prisma) {
    const year = todayIn(BUSINESS_TZ).slice(0, 4)
    const key = `${prefix === 'INV' ? 'invoice' : 'payment'}:${year}`
    const c = await tx.sequenceCounter.upsert({ where: { key }, update: { value: { increment: 1 } }, create: { key, value: 1 } })
    return `${prefix}-${year}-${String(c.value).padStart(4, '0')}`
  }

  private today() { return dateOnly(todayIn(BUSINESS_TZ)) }

  /** The UTC instant a US business day starts. */
  private dayStart(ymd: string) { return dayRangeUtc(ymd, ymd, BUSINESS_TZ).gte }

  // ── Shape for the browser (argroup's field names, so the screens port as they are) ──

  private shape(i: InvoiceRow) {
    const c = i.client
    return {
      ...i,
      amount: num(i.totalAmount), subtotal: num(i.subtotal), discount: num(i.discount), adjustment: num(i.adjustment),
      amountPaid: num(i.amountPaid), discountTotal: num(i.discountTotal),
      issueDate: fmtDateOnly(i.invoiceDate), dueDate: fmtDateOnly(i.dueDate),
      billingPeriodStart: fmtDateOnly(i.billingPeriodStart), billingPeriodEnd: fmtDateOnly(i.billingPeriodEnd),
      client: c && { ...c, businessName: c.companyName, rateOfSaleAmount: c.rateOfSaleAmount === null ? null : num(c.rateOfSaleAmount), openingBalance: num(c.openingBalance) },
      createdBy: i.createdBy && { id: i.createdBy.id, fullName: fullName(i.createdBy) },
      items: [...i.items].sort((a, b) => a.customer.createdAt.getTime() - b.customer.createdAt.getTime()).map(it => ({   // by sale date
        id: it.id, customerId: it.customerId, rate: num(it.rate), amount: num(it.amount), description: it.description,
        customer: {
          id: it.customer.id, name: fullName(it.customer), phone: it.customer.phone, state: it.customer.state,
          verticalType: it.customer.verticalType, didCode: it.customer.saleDidCode,
          saleDate: todayIn(BUSINESS_TZ, it.customer.createdAt), saleTimeEst: it.customer.submittedAtEst,
          finalApprovedAt: it.customer.finalApprovedAt, agent: fullName(it.customer.agent),
        },
      })),
      allocations: i.allocations.map(a => ({
        ...a, amount: num(a.amount), discount: num(a.discount),
        payment: { ...a.payment, amount: num(a.payment.amount), recordedBy: a.payment.recordedBy && { id: a.payment.recordedBy.id, fullName: fullName(a.payment.recordedBy) } },
      })),
    }
  }

  // ── Listing ────────────────────────────────────────────────────────────────

  async list(q: Record<string, string | undefined>) {
    await this.sweepOverdue()
    const where: Prisma.InvoiceWhereInput = {}
    if (q.status && q.status !== 'ALL') where.status = q.status
    if (q.clientId) where.clientId = q.clientId
    if (q.search) {
      const s = { contains: q.search, mode: 'insensitive' as const }
      where.OR = [{ invoiceNumber: s }, { description: s }, { client: { companyName: s } }]
    }
    const rows = await this.prisma.invoice.findMany({ where, include: INVOICE_INCLUDE, orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }] })
    return rows.map(r => this.shape(r))
  }

  async getOne(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE })
    if (!inv) throw new NotFoundException('Invoice not found.')
    return this.shape(inv)
  }

  /**
   * Every invoice that went out, across all clients, with its balance and how it stands today
   * (notdue / overdue / partial / paid), so the Invoicing Details page only renders.
   */
  async register(q: Record<string, string | undefined>) {
    await this.sweepOverdue()
    const where: Prisma.InvoiceWhereInput = { status: { in: BILLABLE } }
    if (q.clientId) where.clientId = q.clientId
    if (isYmd(q.from) || isYmd(q.to)) where.invoiceDate = { ...(isYmd(q.from) ? { gte: dateOnly(q.from) } : {}), ...(isYmd(q.to) ? { lte: dateOnly(q.to) } : {}) }
    if (q.search) {
      const s = { contains: q.search, mode: 'insensitive' as const }
      where.OR = [{ invoiceNumber: s }, { description: s }, { client: { companyName: s } }]
    }
    const rows = await this.prisma.invoice.findMany({
      where,
      select: {
        id: true, invoiceNumber: true, kind: true, status: true, description: true, invoiceDate: true, dueDate: true,
        sentAt: true, paidAt: true, subtotal: true, discount: true, adjustment: true, totalAmount: true,
        amountPaid: true, discountTotal: true, billingPeriodStart: true, billingPeriodEnd: true,
        client: { select: { id: true, companyName: true, didCode: true } }, _count: { select: { items: true } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    })
    const today = this.today()
    return rows.map(i => {
      const settled = num(i.amountPaid) + num(i.discountTotal)
      const balance = r2(num(i.totalAmount) - settled)
      const overdue = balance > 0.001 && i.dueDate < today
      return {
        id: i.id, invoiceNumber: i.invoiceNumber, kind: i.kind, status: i.status, description: i.description,
        issueDate: fmtDateOnly(i.invoiceDate), dueDate: fmtDateOnly(i.dueDate), sentAt: i.sentAt, paidAt: i.paidAt,
        billingPeriodStart: fmtDateOnly(i.billingPeriodStart), billingPeriodEnd: fmtDateOnly(i.billingPeriodEnd),
        amount: num(i.totalAmount), subtotal: num(i.subtotal), discount: num(i.discount), adjustment: num(i.adjustment),
        amountPaid: num(i.amountPaid), discountTotal: num(i.discountTotal), salesCount: i._count.items,
        client: { id: i.client.id, businessName: i.client.companyName, didCode: i.client.didCode },
        clientName: i.client.companyName,
        settled, balance,
        daysOverdue: overdue ? Math.floor((today.getTime() - i.dueDate.getTime()) / 86_400_000) : 0,
        bucket: balance <= 0.001 ? 'paid' : overdue ? 'overdue' : settled > 0.001 ? 'partial' : 'notdue',
      }
    })
  }

  /** Header totals; outstanding leaves drafts and cancelled invoices out. */
  async summary() {
    await this.sweepOverdue()
    const [billed, drafts, overdue, credits] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { status: { in: BILLABLE } }, _sum: { totalAmount: true, amountPaid: true, discountTotal: true } }),
      this.prisma.invoice.count({ where: { status: 'DRAFT' } }),
      this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
      this.prisma.payment.findMany({ where: { overpaymentType: 'ADVANCE' }, select: { amount: true, allocations: { select: { amount: true } } } }),
    ])
    const invoiced = num(billed._sum.totalAmount), paid = num(billed._sum.amountPaid), discounts = num(billed._sum.discountTotal)
    const unapplied = credits.reduce((s, p) => s + num(p.amount) - p.allocations.reduce((t, a) => t + num(a.amount), 0), 0)
    return {
      draftCount: drafts, overdueCount: overdue, totalInvoiced: r2(invoiced),
      totalPaid: r2(paid + unapplied), outstanding: r2(invoiced - paid - discounts - unapplied),
    }
  }

  /** Every client with its running account totals, for the Clients Ledgers sidebar. */
  async clientsWithBalances(search?: string) {
    await this.sweepOverdue()
    const clients = await this.prisma.client.findMany({
      where: search ? { OR: [{ companyName: { contains: search, mode: 'insensitive' } }, { didCode: { contains: search, mode: 'insensitive' } }] } : undefined,
      select: {
        id: true, companyName: true, didCode: true, isActive: true, cycleOfDay: true,
        invoices: { select: { status: true, totalAmount: true } },
        payments: { select: { amount: true, overpaymentType: true, allocations: { select: { amount: true, discount: true } } } },
      },
      orderBy: [{ isActive: 'desc' }, { companyName: 'asc' }],
    })
    return clients.map(c => {
      const invoiced = c.invoices.filter(i => BILLABLE.includes(i.status)).reduce((s, i) => s + num(i.totalAmount), 0)
      let cash = 0, nonCash = 0, credit = 0
      for (const p of c.payments) {
        const applied = p.allocations.reduce((s, a) => s + num(a.amount), 0)
        const spare = num(p.amount) - applied
        const bonus = p.overpaymentType === 'BONUS' && spare > 0
        cash += bonus ? applied : num(p.amount)
        credit += bonus ? 0 : spare
        nonCash += p.allocations.reduce((s, a) => s + num(a.discount), 0)
      }
      return {
        id: c.id, businessName: c.companyName, fullName: c.didCode, didCode: c.didCode, isActive: c.isActive, cycleOfDay: c.cycleOfDay,
        totalInvoiced: r2(invoiced), totalPaid: r2(cash), unappliedCredit: r2(credit), outstanding: r2(invoiced - cash - nonCash),
        draftCount: c.invoices.filter(i => i.status === 'DRAFT').length,
        overdueCount: c.invoices.filter(i => i.status === 'OVERDUE').length,
      }
    })
  }

  /**
   * The client's account as a dated statement, optionally for a period. "Opening Balance" is the
   * balance brought forward to the start of the period (the client's opening balance is an
   * OPENING invoice in the timeline), so opening + invoiced − settled always ties out.
   */
  async clientLedger(clientId: string, from?: string, to?: string) {
    await this.sweepOverdue()
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: CLIENT_SELECT })
    if (!client) throw new NotFoundException('Client not found.')

    const invoices = await this.prisma.invoice.findMany({
      where: { clientId, status: { not: 'DRAFT' } },     // drafts live in Invoice Approval
      include: INVOICE_INCLUDE,
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    })
    const payments = await this.clientPayments(clientId)

    type Txn = { date: string; type: 'INVOICE' | 'OPENING' | 'PAYMENT' | 'DISCOUNT'; ref: string; description: string; charge: number; credit: number; paymentId?: string; unapplied?: number }
    const txns: Txn[] = []
    for (const i of invoices.filter(x => BILLABLE.includes(x.status))) {
      txns.push({
        date: fmtDateOnly(i.invoiceDate)!, type: i.kind === 'OPENING' ? 'OPENING' : 'INVOICE', ref: i.invoiceNumber,
        description: i.description ?? 'Sales', charge: num(i.totalAmount), credit: 0,
      })
    }
    for (const p of payments) {
      const against = p.allocations.length ? p.allocations.map(a => a.invoice.invoiceNumber).join(', ') : 'Advance'
      const credit = p.bonus > 0 ? p.applied : p.amount
      txns.push({
        date: fmtDateOnly(p.paidAt)!, type: 'PAYMENT', ref: p.paymentNumber,
        description: `Payment received, ${METHOD_LABEL[p.method] ?? p.method}${p.reference ? ` (${p.reference})` : ''}`
          + (p.allocations.length ? ` · against ${against}` : '')
          + (p.unapplied > 0 ? ` · $${p.unapplied.toFixed(2)} unapplied` : '')
          + (p.bonus > 0 ? ` · $${p.bonus.toFixed(2)} kept as bonus` : ''),
        charge: 0, credit, paymentId: p.id, unapplied: p.unapplied,
      })
      for (const a of p.allocations) {
        if (a.discount > 0) txns.push({ date: fmtDateOnly(p.paidAt)!, type: 'DISCOUNT', ref: a.invoice.invoiceNumber, description: 'Discount allowed', charge: 0, credit: a.discount, paymentId: p.id })
      }
    }
    txns.sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'OPENING' ? -1 : b.type === 'OPENING' ? 1 : 0))

    let openingBalance = 0
    const inPeriod: Txn[] = []
    for (const t of txns) {
      if (isYmd(from) && t.date < from) { openingBalance += t.charge - t.credit; continue }
      if (isYmd(to) && t.date > to) continue
      inPeriod.push(t)
    }
    const totalInvoiced = inPeriod.reduce((s, t) => s + t.charge, 0)
    const totalSettled = inPeriod.reduce((s, t) => s + t.credit, 0)
    let running = openingBalance
    const timeline = inPeriod.map(t => { running += t.charge - t.credit; return { ...t, balance: r2(running) } })

    return {
      client: { ...client, businessName: client.companyName, rateOfSaleAmount: client.rateOfSaleAmount === null ? null : num(client.rateOfSaleAmount), openingBalance: num(client.openingBalance) },
      openingBalance: r2(openingBalance),
      totalInvoiced: r2(totalInvoiced),
      totalPaid: r2(inPeriod.filter(t => t.type === 'PAYMENT').reduce((s, t) => s + t.credit, 0)),
      totalDiscount: r2(inPeriod.filter(t => t.type === 'DISCOUNT').reduce((s, t) => s + t.credit, 0)),
      totalBonus: r2(payments.reduce((s, p) => s + p.bonus, 0)),
      unappliedCredit: r2(payments.reduce((s, p) => s + p.unapplied, 0)),
      outstanding: r2(openingBalance + totalInvoiced - totalSettled),
      invoices: invoices.map(i => this.shape(i)),
      payments,
      timeline,
    }
  }

  /**
   * Invoices a payment can go against (Receive Payment). With `paymentId` the payment is being
   * edited: the invoices it already settled come back too, with balances as if it were not there.
   */
  async openInvoices(clientId: string, paymentId?: string) {
    const rows = await this.prisma.invoice.findMany({
      where: paymentId ? { clientId, OR: [{ status: { in: AWAITING } }, { allocations: { some: { paymentId } } }] } : { clientId, status: { in: AWAITING } },
      orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],   // oldest first: the order a payment auto-applies in
      select: {
        id: true, invoiceNumber: true, description: true, invoiceDate: true, dueDate: true, totalAmount: true, amountPaid: true, discountTotal: true,
        billingPeriodStart: true, billingPeriodEnd: true,
        allocations: paymentId ? { where: { paymentId }, select: { amount: true, discount: true } } : false,
      },
    })
    return rows.map((i: any) => {
      const mine = (i.allocations ?? []).reduce((s: number, a: any) => s + num(a.amount) + num(a.discount), 0)
      const current = (i.allocations ?? [])[0]
      return {
        id: i.id, invoiceNumber: i.invoiceNumber, description: i.description,
        issueDate: fmtDateOnly(i.invoiceDate), dueDate: fmtDateOnly(i.dueDate), amount: num(i.totalAmount),
        billingPeriodStart: fmtDateOnly(i.billingPeriodStart), billingPeriodEnd: fmtDateOnly(i.billingPeriodEnd),
        balance: r2(num(i.totalAmount) - (num(i.amountPaid) + num(i.discountTotal) - mine)),
        current: current ? { amount: num(current.amount), discount: num(current.discount) } : null,
      }
    })
  }

  // ── Opening balance ────────────────────────────────────────────────────────

  /**
   * Stores the opening balance on the client and mirrors it as one OPENING invoice, so it shows in
   * the ledger and settles through Receive Payment like any invoice.
   */
  async setOpeningBalance(clientId: string, b: Record<string, any>) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) throw new NotFoundException('Client not found.')
    const amount = r2(Math.max(0, V.num(b.openingBalance, 'Opening balance', { min: 0 }) ?? 0))
    const date = V.date(b.date, 'Date') ?? todayIn(BUSINESS_TZ)
    await this.syncOpeningInvoice(clientId, amount, date)
    const updated = await this.prisma.client.update({
      where: { id: clientId }, data: { openingBalance: amount, openingBalanceDate: dateOnly(date) },
      select: { id: true, openingBalance: true, openingBalanceDate: true },
    })
    return { ...updated, openingBalance: num(updated.openingBalance) }
  }

  /** Keeps the OPENING invoice in line with the client's opening balance (also used by the client form). */
  async syncOpeningInvoice(clientId: string, amount: number, date = todayIn(BUSINESS_TZ)) {
    const existing = await this.prisma.invoice.findFirst({ where: { clientId, kind: 'OPENING' }, include: { allocations: { select: { id: true } } } })
    if (amount > 0) {
      if (existing) {
        await this.prisma.invoice.update({
          where: { id: existing.id },
          data: { subtotal: amount, totalAmount: amount, invoiceDate: dateOnly(date), dueDate: dateOnly(date), billingPeriodStart: dateOnly(date), billingPeriodEnd: dateOnly(date) },
        })
        await this.recomputeInvoices([existing.id])
      } else {
        await this.prisma.invoice.create({
          data: {
            invoiceNumber: await this.next('INV'), clientId, kind: 'OPENING', status: 'SENT', description: 'Opening Balance',
            subtotal: amount, totalAmount: amount, invoiceDate: dateOnly(date), dueDate: dateOnly(date),
            billingPeriodStart: dateOnly(date), billingPeriodEnd: dateOnly(date), sentAt: new Date(),
          },
        })
      }
    } else if (existing && existing.allocations.length === 0) {
      await this.prisma.invoice.delete({ where: { id: existing.id } })
    }
  }

  // ── Sales that can be billed ───────────────────────────────────────────────

  /** A sale is billed once it is on an invoice that is not cancelled. */
  private unbilled(clientId: string, extra: Prisma.CustomerWhereInput = {}): Prisma.CustomerWhereInput {
    return {
      clientId, status: CustomerStatus.FINAL_APPROVED,
      invoiceItems: { none: { invoice: { status: { not: 'CANCELLED' } } } },
      ...extra,
    }
  }

  private saleRate(c: { saleRateAmount: Prisma.Decimal | null }, client: { rateOfSaleAmount: Prisma.Decimal | null }) {
    return r2(num(c.saleRateAmount ?? client.rateOfSaleAmount))
  }

  /** Sale dates are US business days (as on the Sales Report); either end may be left open. */
  private saleDates(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!isYmd(from) && !isYmd(to)) return undefined
    return {
      ...(isYmd(from) ? { gte: this.dayStart(from) } : {}),
      ...(isYmd(to) ? { lt: this.dayStart(addDays(to, 1)) } : {}),
    }
  }

  /** The client's final approved sales not on any invoice yet, by sale date (for New Invoice). */
  async unbilledSales(clientId: string, q: Record<string, string | undefined>) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, rateOfSaleAmount: true } })
    if (!client) throw new NotFoundException('Client not found.')
    const createdAt = this.saleDates(q.from, q.to)
    const rows = await this.prisma.customer.findMany({
      where: this.unbilled(clientId, createdAt ? { createdAt } : {}),
      select: { id: true, firstName: true, midName: true, lastName: true, phone: true, state: true, verticalType: true, createdAt: true, finalApprovedAt: true, saleRateAmount: true, agent: PERSON },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(c => ({
      id: c.id, name: fullName(c), phone: c.phone, state: c.state, verticalType: c.verticalType,
      saleDate: todayIn(BUSINESS_TZ, c.createdAt), finalApprovedAt: c.finalApprovedAt, agent: fullName(c.agent),
      rate: this.saleRate(c, client),
    }))
  }

  /**
   * Every final approved sale of the client with its billing record: the invoice it is on (number,
   * date, status), or not invoiced yet. Drafts count as "on a draft", cancelled invoices as not billed.
   */
  async clientSales(clientId: string, q: Record<string, string | undefined>) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, rateOfSaleAmount: true } })
    if (!client) throw new NotFoundException('Client not found.')
    const createdAt = this.saleDates(q.from, q.to)
    const rows = await this.prisma.customer.findMany({
      where: { clientId, status: CustomerStatus.FINAL_APPROVED, ...(createdAt ? { createdAt } : {}) },
      select: {
        id: true, firstName: true, midName: true, lastName: true, phone: true, verticalType: true, createdAt: true, finalApprovedAt: true, saleRateAmount: true,
        agent: PERSON,
        invoiceItems: {
          where: { invoice: { status: { not: 'CANCELLED' } } },
          select: { rate: true, invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, sentAt: true, status: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(c => {
      const item = c.invoiceItems[0]
      const inv = item?.invoice
      return {
        id: c.id, name: fullName(c), phone: c.phone, verticalType: c.verticalType, agent: fullName(c.agent),
        saleDate: todayIn(BUSINESS_TZ, c.createdAt), finalApprovedAt: c.finalApprovedAt,
        rate: item ? num(item.rate) : this.saleRate(c, client),
        billing: !inv ? 'NOT_INVOICED' : inv.status === 'DRAFT' ? 'ON_DRAFT' : 'INVOICED',
        invoice: inv ? { id: inv.id, invoiceNumber: inv.invoiceNumber, issueDate: fmtDateOnly(inv.invoiceDate), sentAt: inv.sentAt, status: inv.status } : null,
      }
    })
  }

  // ── Create / edit ──────────────────────────────────────────────────────────

  private totals(subtotal: number, discount: number, adjustment: number) {
    return { subtotal: r2(subtotal), discount: r2(discount), adjustment: r2(adjustment), totalAmount: r2(subtotal - discount + adjustment) }
  }

  /** Reads `items: [{customerId, rate}]` and checks every sale belongs to the client, is final approved and not billed elsewhere. */
  private async readLines(clientId: string, raw: unknown, invoiceId?: string) {
    if (!Array.isArray(raw)) fail('Sales are required.')
    const lines = new Map<string, number>()
    for (const r of raw as any[]) {
      const id = V.str(r?.customerId, 'Sale', { required: true })!
      if (lines.has(id)) fail('The same sale is listed twice.')
      lines.set(id, r2(V.num(r?.rate, 'Rate', { required: true, min: 0 })!))
    }
    if (!lines.size) return []
    const ok = await this.prisma.customer.findMany({
      where: {
        id: { in: [...lines.keys()] }, clientId, status: CustomerStatus.FINAL_APPROVED,
        invoiceItems: { none: { invoice: { status: { not: 'CANCELLED' }, ...(invoiceId ? { id: { not: invoiceId } } : {}) } } },
      },
      select: { id: true, firstName: true, midName: true, lastName: true, phone: true },
    })
    if (ok.length !== lines.size) fail('One or more sales are not final approved for this client, or are already on another invoice.')
    return ok.map(c => ({ customerId: c.id, rate: lines.get(c.id)!, amount: lines.get(c.id)!, description: `${fullName(c)}${c.phone ? ` · ${c.phone}` : ''}`.slice(0, 300) }))
  }

  /** New Invoice: the director bills chosen sales off-cycle (or only an adjustment). Starts as a draft. */
  async create(b: Record<string, any>, userId: string) {
    const clientId = V.str(b.clientId, 'Client', { required: true })!
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) throw new NotFoundException('Client not found.')
    const lines = await this.readLines(clientId, b.items ?? [])
    const discount = V.num(b.discount, 'Discount', { min: 0 }) ?? 0
    const adjustment = V.num(b.adjustment, 'Adjustment') ?? 0
    if (!lines.length && adjustment <= 0) fail('Pick at least one sale, or enter an adjustment to bill.')
    const today = todayIn(BUSINESS_TZ)
    const start = V.date(b.periodStart, 'Period start') ?? today
    const end = V.date(b.periodEnd, 'Period end') ?? start
    if (end < start) fail('Period end must be on or after the period start.')
    const invoiceDate = V.date(b.issueDate, 'Invoice date') ?? today
    const dueDate = V.date(b.dueDate, 'Due date') ?? addDays(invoiceDate, DUE_AFTER_DAYS)
    const t = this.totals(lines.reduce((s, l) => s + l.amount, 0), discount, adjustment)
    if (t.totalAmount < 0) fail('The invoice total cannot be below zero.')
    const inv = await this.prisma.invoice.create({
      data: {
        invoiceNumber: await this.next('INV'), clientId, kind: 'MANUAL', status: 'DRAFT', ...t,
        description: V.str(b.description, 'Description', { max: 500 }) ?? `${lines.length} sale${lines.length === 1 ? '' : 's'}, ${start === end ? fmtShortDate(start) : `${fmtShortDate(start)} to ${fmtShortDate(end)}`}`,
        billingPeriodStart: dateOnly(start), billingPeriodEnd: dateOnly(end),
        invoiceDate: dateOnly(invoiceDate), dueDate: dateOnly(dueDate),
        notes: V.str(b.notes, 'Notes', { max: 2000 }), createdById: userId,
        items: { create: lines },
      },
      include: INVOICE_INCLUDE,
    })
    return this.shape(inv)
  }

  /**
   * Edit an invoice. The sales on it change only while it is a draft; once sent, the discount,
   * adjustment, dates and notes can still change and its status is worked out again.
   */
  async update(id: string, b: Record<string, any>) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { items: true } })
    if (!inv) throw new NotFoundException('Invoice not found.')
    if (inv.status === 'CANCELLED') fail('A cancelled invoice cannot be edited.')
    if (inv.kind === 'OPENING') fail('Change the opening balance from the client in Clients Ledgers.')
    const draft = inv.status === 'DRAFT'

    let lines: Awaited<ReturnType<typeof this.readLines>> | null = null
    if (b.items !== undefined) {
      if (!draft) fail('The sales on a sent invoice cannot change. Cancel it and raise a new one.')
      lines = await this.readLines(inv.clientId, b.items, id)
    }
    const subtotal = lines ? lines.reduce((s, l) => s + l.amount, 0) : num(inv.subtotal)
    const discount = V.num(b.discount, 'Discount', { min: 0 }) ?? num(inv.discount)
    const adjustment = V.num(b.adjustment, 'Adjustment') ?? num(inv.adjustment)
    const t = this.totals(subtotal, discount, adjustment)
    if (t.totalAmount < 0) fail('The invoice total cannot be below zero.')
    const settled = num(inv.amountPaid) + num(inv.discountTotal)
    if (!draft && t.totalAmount < settled - 0.001) fail(`$${settled.toFixed(2)} is already settled on this invoice; the total cannot go below it.`)
    const invoiceDate = V.date(b.issueDate, 'Invoice date')
    const dueDate = V.date(b.dueDate, 'Due date')

    await this.prisma.$transaction(async tx => {
      if (lines) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } })
        if (lines.length) await tx.invoiceItem.createMany({ data: lines.map(l => ({ ...l, invoiceId: id })) })
      }
      await tx.invoice.update({
        where: { id },
        data: {
          ...t,
          ...(invoiceDate ? { invoiceDate: dateOnly(invoiceDate) } : {}),
          ...(dueDate ? { dueDate: dateOnly(dueDate) } : {}),
          ...(b.description !== undefined ? { description: V.str(b.description, 'Description', { max: 500 }) } : {}),
          ...(b.notes !== undefined ? { notes: V.str(b.notes, 'Notes', { max: 2000 }) } : {}),
        },
      })
    })
    if (!draft) await this.recomputeInvoices([id])
    return this.getOne(id)
  }

  async send(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } })
    if (!inv) throw new NotFoundException('Invoice not found.')
    if (inv.status !== 'DRAFT') fail('Only a draft can be sent.')
    if (num(inv.totalAmount) <= 0) fail('Set an amount before sending this invoice.')
    await this.prisma.invoice.update({
      where: { id },
      data: { status: this.deriveStatus(num(inv.totalAmount), 0, inv.dueDate), sentAt: new Date() },
    })
    return this.getOne(id)
  }

  /** Voids an issued invoice; its sales can be billed again. */
  async cancel(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { allocations: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found.')
    if (inv.allocations.length) fail('Cannot cancel an invoice that has payments applied to it.')
    if (inv.kind === 'OPENING') fail('Set the opening balance to zero instead.')
    await this.prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' } })
    return this.getOne(id)
  }

  /** Deletes a draft (or an unpaid invoice); its sales go back to unbilled and join the next cycle's draft. */
  async remove(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { allocations: { select: { id: true } } } })
    if (!inv) throw new NotFoundException('Invoice not found.')
    if (inv.allocations.length) fail('Cannot delete an invoice that has payments applied to it, cancel it instead.')
    if (inv.kind === 'OPENING') fail('Set the opening balance to zero instead.')
    await this.prisma.invoice.delete({ where: { id } })
    return { ok: true }
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  private deriveStatus(amount: number, settled: number, dueDate: Date): string {
    if (amount > 0 && settled >= amount - 0.001) return 'PAID'
    if (settled > 0) return 'PARTIALLY_PAID'
    if (dueDate < this.today()) return 'OVERDUE'
    return 'SENT'
  }

  /** Flips issued, unpaid invoices past their due date to OVERDUE (and back if the date moved). */
  private async sweepOverdue() {
    const today = this.today()
    await this.prisma.invoice.updateMany({ where: { status: 'SENT', dueDate: { lt: today } }, data: { status: 'OVERDUE' } })
    await this.prisma.invoice.updateMany({ where: { status: 'OVERDUE', dueDate: { gte: today } }, data: { status: 'SENT' } })
  }

  /** Rebuilds an invoice's settled figures and status from its allocations, never by nudging totals. */
  private async recomputeInvoices(ids: string[]) {
    for (const id of [...new Set(ids)]) {
      const inv = await this.prisma.invoice.findUnique({
        where: { id }, select: { totalAmount: true, status: true, paidAt: true, dueDate: true, allocations: { select: { amount: true, discount: true } } },
      })
      if (!inv || inv.status === 'CANCELLED' || inv.status === 'DRAFT') continue
      const paid = r2(inv.allocations.reduce((s, a) => s + num(a.amount), 0))
      const discount = r2(inv.allocations.reduce((s, a) => s + num(a.discount), 0))
      const status = this.deriveStatus(num(inv.totalAmount), paid + discount, inv.dueDate)
      await this.prisma.invoice.update({
        where: { id },
        data: { amountPaid: paid, discountTotal: discount, status, paidAt: status === 'PAID' ? inv.paidAt ?? new Date() : null },
      })
    }
  }

  // ── Payments (QuickBooks style, as argroup) ────────────────────────────────

  private readAllocs(raw: unknown): Alloc[] {
    if (raw === undefined || raw === null) return []
    if (!Array.isArray(raw)) fail('Allocations must be a list.')
    return (raw as any[]).map(a => ({
      invoiceId: V.str(a?.invoiceId, 'Invoice', { required: true })!,
      amount: r2(V.num(a?.amount, 'Amount', { min: 0 }) ?? 0),
      discount: r2(V.num(a?.discount, 'Discount', { min: 0 }) ?? 0),
    })).filter(a => a.amount + a.discount > 0)
  }

  /** Checks allocations against the invoices they target; throws before anything is written. */
  private async validateAllocations(clientId: string, allocs: Alloc[], replacingPaymentId?: string) {
    if (!allocs.length) return
    if (new Set(allocs.map(a => a.invoiceId)).size !== allocs.length) fail('The same invoice is listed twice.')
    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: allocs.map(a => a.invoiceId) }, clientId },
      select: { id: true, invoiceNumber: true, totalAmount: true, status: true, allocations: { select: { paymentId: true, amount: true, discount: true } } },
    })
    if (invoices.length !== allocs.length) fail('One or more invoices do not belong to this client.')
    for (const a of allocs) {
      const inv = invoices.find(i => i.id === a.invoiceId)!
      // When a payment's allocations are replaced, an invoice it paid off may be PAID: allowed
      const allowed = replacingPaymentId ? BILLABLE : AWAITING
      if (!allowed.includes(inv.status)) fail(`${inv.invoiceNumber} is not awaiting payment.`)
      const others = inv.allocations.filter(x => x.paymentId !== replacingPaymentId).reduce((s, x) => s + num(x.amount) + num(x.discount), 0)
      const balance = r2(num(inv.totalAmount) - others)
      if (a.amount + a.discount > balance + 0.001) fail(`Payment and discount together exceed the $${balance.toFixed(2)} balance on ${inv.invoiceNumber}.`)
    }
  }

  private readPaymentFields(b: Record<string, any>, creating: boolean) {
    return {
      amount: V.num(b.amount, 'Amount received', { required: creating, min: 0 }),
      method: V.oneOf(b.method, 'Method', METHODS, { required: creating }),
      reference: V.str(b.reference, 'Reference', { max: 120 }),
      proofUrl: V.str(b.proofUrl, 'Proof', { max: 500 }),
      paidAt: V.date(b.paidAt, 'Date received'),
      notes: V.str(b.notes, 'Notes', { max: 2000 }),
      overpaymentType: V.oneOf(b.overpaymentType, 'Extra amount', ['ADVANCE', 'BONUS'] as const),
    }
  }

  /**
   * Receive Payment. `amount` is what the client paid; allocations say which invoices it settles
   * (cash and any discount allowed). Whatever is left stays as credit on the client's account.
   */
  async receivePayment(b: Record<string, any>, userId: string) {
    const clientId = V.str(b.clientId, 'Client', { required: true })!
    const f = this.readPaymentFields(b, true)
    const allocs = this.readAllocs(b.allocations)
    const cash = allocs.reduce((s, a) => s + a.amount, 0)
    if (cash > f.amount! + 0.001) fail('Cash applied to invoices is more than the payment received.')
    await this.validateAllocations(clientId, allocs)
    const payment = await this.prisma.payment.create({
      data: {
        clientId, paymentNumber: await this.next('PMT'), amount: r2(f.amount!), method: f.method!,
        reference: f.reference ?? null, proofUrl: f.proofUrl ?? null, notes: f.notes ?? null,
        paidAt: f.paidAt ? dateOnly(f.paidAt) : this.today(), overpaymentType: f.overpaymentType ?? 'ADVANCE', recordedById: userId,
        allocations: { create: allocs.map(a => ({ invoiceId: a.invoiceId, amount: a.amount, discount: a.discount })) },
      },
    })
    await this.recomputeInvoices(allocs.map(a => a.invoiceId))
    return { ok: true, paymentId: payment.id, applied: allocs.length, unapplied: r2(f.amount! - cash) }
  }

  /** Puts an advance payment's leftover credit against invoices raised since. */
  async applyPayment(paymentId: string, b: Record<string, any>) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { allocations: true } })
    if (!payment) throw new NotFoundException('Payment not found.')
    const unapplied = num(payment.amount) - payment.allocations.reduce((s, a) => s + num(a.amount), 0)
    const allocs = this.readAllocs(b.allocations)
    if (!allocs.length) fail('Nothing to apply.')
    if (allocs.reduce((s, a) => s + a.amount, 0) > unapplied + 0.001) fail('Applied amount is more than this payment has left.')
    await this.validateAllocations(payment.clientId, allocs)
    for (const a of allocs) {
      const existing = payment.allocations.find(x => x.invoiceId === a.invoiceId)
      if (existing) await this.prisma.paymentAllocation.update({ where: { id: existing.id }, data: { amount: r2(num(existing.amount) + a.amount), discount: r2(num(existing.discount) + a.discount) } })
      else await this.prisma.paymentAllocation.create({ data: { paymentId, invoiceId: a.invoiceId, amount: a.amount, discount: a.discount } })
    }
    await this.recomputeInvoices(allocs.map(a => a.invoiceId))
    return { ok: true, applied: allocs.length, remaining: r2(unapplied - allocs.reduce((s, a) => s + a.amount, 0)) }
  }

  /** Every payment from the client, with how much of each is applied, unapplied credit or bonus. */
  async clientPayments(clientId: string) {
    const rows = await this.prisma.payment.findMany({ where: { clientId }, include: PAYMENT_INCLUDE, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] })
    return rows.map(p => {
      const applied = r2(p.allocations.reduce((s, a) => s + num(a.amount), 0))
      const spare = r2(num(p.amount) - applied)
      const bonus = p.overpaymentType === 'BONUS' && spare > 0
      return {
        ...p, amount: num(p.amount), paidAt: p.paidAt,
        allocations: p.allocations.map(a => ({ ...a, amount: num(a.amount), discount: num(a.discount) })),
        recordedBy: p.recordedBy && { id: p.recordedBy.id, fullName: fullName(p.recordedBy) },
        applied, unapplied: bonus ? 0 : spare, bonus: bonus ? spare : 0,
      }
    })
  }

  /**
   * Edits a payment. Allocations, when sent, replace where the payment went: that is how a payment
   * booked against the wrong invoice moves to the right one.
   */
  async updatePayment(paymentId: string, b: Record<string, any>) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { allocations: true } })
    if (!payment) throw new NotFoundException('Payment not found.')
    const f = this.readPaymentFields(b, false)
    const amount = f.amount ?? num(payment.amount)
    let touched: string[] = []
    if (b.allocations !== undefined) {
      const allocs = this.readAllocs(b.allocations)
      if (allocs.reduce((s, a) => s + a.amount, 0) > amount + 0.001) fail('Applied cash is more than the payment amount.')
      await this.validateAllocations(payment.clientId, allocs, paymentId)
      touched = [...payment.allocations.map(a => a.invoiceId), ...allocs.map(a => a.invoiceId)]
      await this.prisma.$transaction([
        this.prisma.paymentAllocation.deleteMany({ where: { paymentId } }),
        ...allocs.map(a => this.prisma.paymentAllocation.create({ data: { paymentId, invoiceId: a.invoiceId, amount: a.amount, discount: a.discount } })),
      ])
    } else if (f.amount !== undefined && f.amount !== null) {
      const applied = payment.allocations.reduce((s, a) => s + num(a.amount), 0)
      if (f.amount < applied - 0.001) fail(`This payment already has $${applied.toFixed(2)} applied to invoices, unapply some first.`)
    }
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        ...(f.amount !== undefined && f.amount !== null ? { amount: r2(f.amount) } : {}),
        ...(f.method ? { method: f.method } : {}),
        ...(b.reference !== undefined ? { reference: f.reference ?? null } : {}),
        ...(b.proofUrl !== undefined ? { proofUrl: f.proofUrl ?? null } : {}),
        ...(f.paidAt ? { paidAt: dateOnly(f.paidAt) } : {}),
        ...(b.notes !== undefined ? { notes: f.notes ?? null } : {}),
        ...(f.overpaymentType ? { overpaymentType: f.overpaymentType } : {}),
      },
    })
    if (touched.length) await this.recomputeInvoices(touched)
    return { ok: true }
  }

  /** Pulls a payment's slice back off an invoice; the money returns to unapplied credit. */
  async unapplyAllocation(allocationId: string) {
    const a = await this.prisma.paymentAllocation.findUnique({ where: { id: allocationId } })
    if (!a) throw new NotFoundException('Allocation not found.')
    await this.prisma.paymentAllocation.delete({ where: { id: allocationId } })
    await this.recomputeInvoices([a.invoiceId])
    return { ok: true }
  }

  async deletePayment(paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { allocations: { select: { invoiceId: true } } } })
    if (!p) throw new NotFoundException('Payment not found.')
    await this.prisma.payment.delete({ where: { id: paymentId } })   // allocations cascade
    await this.recomputeInvoices(p.allocations.map(a => a.invoiceId))
    return { ok: true }
  }

  // ── Billing cycles: the drafts ─────────────────────────────────────────────

  /**
   * The day the client's billing clock starts: its first sale approved by a manager, or its first
   * final approved sale, as the client's "Billing Starts After" setting says. Null before that.
   */
  private async anchorOf(client: { id: string; billingStartAfter: string }): Promise<string | null> {
    const final = client.billingStartAfter === 'first_final_approved'
    const agg = await this.prisma.customer.aggregate({
      where: { clientId: client.id, ...(final ? { finalApprovedAt: { not: null } } : { approvedAt: { not: null } }) },
      _min: { approvedAt: true, finalApprovedAt: true },
    })
    const first = final ? agg._min.finalApprovedAt : agg._min.approvedAt
    return first ? todayIn(BUSINESS_TZ, first) : null
  }

  /**
   * The client's billing cycles that have ended by `today`, as [start, end) business days. The first
   * cycle runs from the anchor for "Billing Starts After (Days)" (or one cycle when that is 0), every
   * later one for "Cycle (Days)".
   */
  cyclePeriods(anchor: string, startAfterDays: number | null, cycleDays: number | null, today: string) {
    const cycle = Math.max(1, cycleDays || DEFAULT_CYCLE)
    const out: { start: string; end: string }[] = []
    let start = anchor
    let end = addDays(anchor, startAfterDays && startAfterDays > 0 ? startAfterDays : cycle)
    for (let i = 0; end <= today && i < 5000; i++) {
      out.push({ start, end })
      start = end
      end = addDays(end, cycle)
    }
    return out
  }

  /** The cycle running now, for the New Invoice form: its dates and the day its invoice falls due. */
  async nextCycleOf(clientId: string) {
    const c = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, billingStartAfter: true, billingStartAfterDays: true, cycleOfDay: true } })
    if (!c) return null
    const anchor = await this.anchorOf(c)
    if (!anchor) return null
    const ended = this.cyclePeriods(anchor, c.billingStartAfterDays, c.cycleOfDay, todayIn(BUSINESS_TZ))
    const start = ended.length ? ended[ended.length - 1].end : anchor
    const end = ended.length ? addDays(start, Math.max(1, c.cycleOfDay || DEFAULT_CYCLE)) : addDays(anchor, c.billingStartAfterDays && c.billingStartAfterDays > 0 ? c.billingStartAfterDays : Math.max(1, c.cycleOfDay || DEFAULT_CYCLE))
    return { start, end: addDays(end, -1), dueOn: end }
  }

  /** Approved sales of the client not invoiced yet, made before `end` (exclusive): how many, how much. */
  private async unbilledBefore(client: { id: string; rateOfSaleAmount: Prisma.Decimal | null }, end: string) {
    const sales = await this.prisma.customer.findMany({
      where: this.unbilled(client.id, { createdAt: { lt: this.dayStart(end) } }),
      select: { saleRateAmount: true, createdAt: true },
    })
    return {
      sales: sales.length,
      amount: r2(sales.reduce((s, c) => s + this.saleRate(c, client), 0)),
      firstSale: sales.length ? sales.map(c => todayIn(BUSINESS_TZ, c.createdAt)).sort()[0] : null,
    }
  }

  /**
   * Invoices Due: every client whose latest billing cycle has ended with approved sales still not
   * invoiced (any made before that cycle ended, so leftovers of earlier cycles count too). This is
   * what the "invoice due" notification points at; creating the invoice clears it.
   */
  async dueInvoices() {
    const today = todayIn(BUSINESS_TZ)
    const clients = await this.prisma.client.findMany({
      select: { id: true, companyName: true, didCode: true, isActive: true, billingStartAfter: true, billingStartAfterDays: true, cycleOfDay: true, rateOfSaleAmount: true },
      orderBy: { companyName: 'asc' },
    })
    const out = []
    for (const c of clients) {
      const anchor = await this.anchorOf(c)
      if (!anchor) continue
      const ended = this.cyclePeriods(anchor, c.billingStartAfterDays, c.cycleOfDay, today)
      if (!ended.length) continue
      const last = ended[ended.length - 1]
      const u = await this.unbilledBefore(c, last.end)
      if (!u.sales) continue
      out.push({
        clientId: c.id, businessName: c.companyName, didCode: c.didCode, isActive: c.isActive, cycleOfDay: c.cycleOfDay,
        periodStart: last.start, periodEnd: addDays(last.end, -1), dueSince: last.end,
        earliestSale: u.firstSale, sales: u.sales, amount: u.amount,
      })
    }
    return out
  }

  /**
   * For the daily job: billing cycles that ended since the director was last told, with approved
   * sales still to invoice. Each ended cycle is announced once (`cycleNotifiedThrough`).
   */
  async newlyDueCycles(today = todayIn(BUSINESS_TZ)) {
    const clients = await this.prisma.client.findMany({
      select: { id: true, companyName: true, billingStartAfter: true, billingStartAfterDays: true, cycleOfDay: true, cycleNotifiedThrough: true, rateOfSaleAmount: true },
    })
    const due: { clientId: string; client: string; periodStart: string; periodEnd: string; sales: number; amount: number }[] = []
    for (const c of clients) {
      const anchor = await this.anchorOf(c)
      if (!anchor) continue
      const told = fmtDateOnly(c.cycleNotifiedThrough)
      const fresh = this.cyclePeriods(anchor, c.billingStartAfterDays, c.cycleOfDay, today).filter(p => !told || p.end > told)
      if (!fresh.length) continue
      const last = fresh[fresh.length - 1]   // after downtime, one notice for the latest cycle, not one per missed cycle
      const u = await this.unbilledBefore(c, last.end)
      if (u.sales) due.push({ clientId: c.id, client: c.companyName, periodStart: last.start, periodEnd: addDays(last.end, -1), sales: u.sales, amount: u.amount })
      await this.prisma.client.update({ where: { id: c.id }, data: { cycleNotifiedThrough: dateOnly(last.end) } })
    }
    return due
  }
}

export const METHOD_LABEL: Record<string, string> = {
  WIRE: 'Wire transfer', ACH: 'ACH', PAYONEER: 'Payoneer', WISE: 'Wise', PAYPAL: 'PayPal', CHECK: 'Check', CASH: 'Cash', OTHER: 'Other',
}
