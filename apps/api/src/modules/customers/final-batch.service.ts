import { Injectable, NotFoundException } from '@nestjs/common'
import { CustomerStatus, Role, fullName } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail } from '../../common/utils/validate'
import { BUSINESS_TZ, addDays, dayRangeUtc, todayIn } from '../../common/utils/time'
import { clientSnapshot } from './customers.service'

type Actor = { id: string; role: Role }

/** One line of the imported sheet, as the browser read it. */
type InRow = { row: number; phone: string; rate: string | null; date: string | null }

export type RowState =
  | 'ready'            // will be final approved
  | 'no_rate'          // matched, but a variable client needs a rate above 0
  | 'multiple'         // several waiting sales share these digits; the director picks one
  | 'not_found'        // no sale of this client has this number
  | 'invalid_phone'    // fewer than the first 6 digits
  | 'already'          // the sale is already final approved
  | 'waiting_manager'  // the sale has not been manager approved yet
  | 'rejected'         // the sale was rejected
  | 'duplicate'        // an earlier row already took this sale

const MAX_ROWS = 5000
const RECENT_DAYS = 60
const STATUS_TEXT: Record<string, string> = {
  [CustomerStatus.DISAPPROVED]: 'Rejected by Manager',
  [CustomerStatus.FINAL_DISAPPROVED]: 'Final Rejected',
  [CustomerStatus.AGENT_REJECTED]: 'Rejected by Agent',
}

/** A stored phone as its digits, a leading US "1" dropped: "(478) 836-1234" → "4788361234". */
export function phoneDigits(p?: string | null): string {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length === 11 && d[0] === '1' ? d.slice(1) : d
}

/**
 * A phone from a client report as a pattern, "?" for each hidden digit: "(478) 836-XXXX" →
 * "478836????". Null unless the first 6 digits are all there; the rest may be digits or masks.
 */
export function phonePattern(raw: string): string | null {
  let s = String(raw ?? '').replace(/[xX*#•]/g, '?').replace(/[^\d?]/g, '')
  if (s.length === 11 && s[0] === '1') s = s.slice(1)
  if (s.length < 6 || s.length > 10 || !/^\d{6}/.test(s)) return null
  return s
}

export function phoneMatches(pattern: string, digits: string): boolean {
  if (digits.length < pattern.length) return false
  for (let i = 0; i < pattern.length; i++) if (pattern[i] !== '?' && pattern[i] !== digits[i]) return false
  return true
}

/** "$25.50", "25.5", 25.5 → 25.5; "", "-" → null; anything else → NaN. */
export function parseRate(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/[$,\s]/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

/** "2026-11-09 18:41", "11/9/2026" (US order) → "2026-11-09"; null when not a date. */
export function parseCallDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(s)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

@Injectable()
export class FinalBatchService {
  constructor(private prisma: PrismaService) {}

  private async client(id: unknown) {
    const clientId = V.str(id, 'Client', { required: true })!
    const c = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, companyName: true, didCode: true, rateType: true, rateOfSaleAmount: true },
    })
    if (!c) throw new NotFoundException('Client not found.')
    return c
  }

  /**
   * Matches each row of the imported sheet to this client's sales and says what approving would
   * do. Nothing is saved here; the director reviews the sheet first.
   */
  async preview(_actor: Actor, b: Record<string, any>) {
    const client = await this.client(b.clientId)
    const variable = client.rateType === 'variable'
    const rows = this.readRows(b.rows)

    const sales = await this.prisma.customer.findMany({
      where:  { clientId: client.id },
      select: {
        id: true, firstName: true, midName: true, lastName: true, phone: true, status: true, createdAt: true,
        agent: { select: { displayName: true, firstName: true, midName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    type Sale = (typeof sales)[number] & { digits: string; day: string }
    const byPrefix = new Map<string, Sale[]>()
    for (const s of sales) {
      const digits = phoneDigits(s.phone)
      if (digits.length < 6) continue
      const list = byPrefix.get(digits.slice(0, 6)) ?? []
      list.push({ ...s, digits, day: todayIn(BUSINESS_TZ, s.createdAt) })
      byPrefix.set(digits.slice(0, 6), list)
    }
    const lite = (s: Sale) => ({
      id: s.id, name: fullName(s), phone: s.phone, status: s.status, saleDate: s.day, agent: fullName(s.agent),
    })

    const claimed = new Map<string, number>()   // sale id → the row that took it
    const out: any[] = new Array(rows.length)
    const later: { i: number; open: Sale[]; others: number }[] = []
    // A masked number can only be trusted when no other recent sale shares its digits: a row whose
    // sale was approved earlier must not slide onto a different waiting sale. Sales older than this
    // (and not still waiting) no longer count, or every busy area code would need a pick.
    const recentCut = new Date(Date.now() - RECENT_DAYS * 86_400_000)

    const settle = (i: number, sale: Sale) => {
      const r = rows[i]
      claimed.set(sale.id, r.row)
      const rate = variable ? parseRate(r.rate) : client.rateOfSaleAmount === null ? null : Number(client.rateOfSaleAmount)
      const rateOk = !variable || (rate !== null && !Number.isNaN(rate) && rate > 0)
      out[i] = {
        ...out[i], customer: lite(sale), rate: rateOk ? rate : null,
        state: rateOk ? 'ready' : 'no_rate',
        message: rateOk ? 'Ready to approve' : rate === null ? 'Rate is missing' : Number.isNaN(rate) ? 'Rate is not a number' : 'Rate is 0',
      }
    }

    // First pass: rows with one possible sale (or one left after the call date) take it, in sheet order
    rows.forEach((r, i) => {
      const pattern = phonePattern(r.phone)
      const date = parseCallDate(r.date)
      out[i] = { row: r.row, pattern, date }
      if (!pattern) { out[i] = { ...out[i], state: 'invalid_phone', message: 'Needs at least the first 6 digits' }; return }
      const found = (byPrefix.get(pattern.slice(0, 6)) ?? []).filter(s => phoneMatches(pattern, s.digits))
      if (!found.length) { out[i] = { ...out[i], state: 'not_found', message: 'Not in our record' }; return }
      const open = found.filter(s => s.status === CustomerStatus.APPROVED)
      if (!open.length) {
        const done = found.find(s => s.status === CustomerStatus.FINAL_APPROVED)
        const waiting = found.find(s => s.status === CustomerStatus.PENDING)
        const s = done ?? waiting ?? found[0]
        out[i] = {
          ...out[i], customer: lite(s),
          state:   done ? 'already' : waiting ? 'waiting_manager' : 'rejected',
          message: done ? 'Already final approved' : waiting ? 'Not manager approved yet' : `${STATUS_TEXT[s.status] ?? 'Rejected'} in our record`,
        }
        return
      }
      if (!open.some(s => !claimed.has(s.id))) { out[i] = { ...out[i], customer: lite(open[0]), state: 'duplicate', message: `Same sale as row ${claimed.get(open[0].id)}` }; return }

      // The sales this row could mean; the call date narrows them when it can
      let pool = found.filter(s => !claimed.has(s.id) && (s.status === CustomerStatus.APPROVED || s.createdAt >= recentCut))
      if (date) {
        const near = pool.filter(s => s.day >= addDays(date, -1) && s.day <= addDays(date, 1))
        if (near.length) pool = near
      }
      if (pool.length === 1 && pool[0].status !== CustomerStatus.APPROVED) {
        const s = pool[0], done = s.status === CustomerStatus.FINAL_APPROVED, waiting = s.status === CustomerStatus.PENDING
        out[i] = {
          ...out[i], customer: lite(s),
          state:   done ? 'already' : waiting ? 'waiting_manager' : 'rejected',
          message: done ? 'Already final approved' : waiting ? 'Not manager approved yet' : `${STATUS_TEXT[s.status] ?? 'Rejected'} in our record`,
        }
        return
      }
      if (pool.length === 1) { settle(i, pool[0]); return }
      const waitingPool = pool.filter(s => s.status === CustomerStatus.APPROVED)
      later.push({ i, open: waitingPool.length ? waitingPool : open, others: pool.length - waitingPool.length })
    })

    // Second pass: rows that matched several sales, without the ones other rows took
    for (const { i, open, others } of later) {
      const free = open.filter(s => !claimed.has(s.id))
      if (free.length === 1 && !others) settle(i, free[0])
      else if (!free.length) out[i] = { ...out[i], customer: lite(open[0]), state: 'duplicate', message: `Same sale as row ${claimed.get(open[0].id)}` }
      else {
        const what = `${free.length} waiting sale${free.length === 1 ? '' : 's'}${others ? ` and ${others} other recent sale${others === 1 ? '' : 's'}` : ''}`
        out[i] = { ...out[i], state: 'multiple', options: free.map(lite), message: `${what} start with these digits; pick the right one` }
      }
    }

    return {
      client: { id: client.id, companyName: client.companyName, didCode: client.didCode, rateType: client.rateType, rate: client.rateOfSaleAmount === null ? null : Number(client.rateOfSaleAmount) },
      rows: out,
    }
  }

  /** Final approves the sales the director confirmed, each with its rate (variable clients). */
  async approve(actor: Actor, b: Record<string, any>) {
    const client = await this.client(b.clientId)
    const variable = client.rateType === 'variable'
    if (!Array.isArray(b.items) || !b.items.length) fail('Pick at least one sale to approve.')
    if (b.items.length > MAX_ROWS) fail(`At most ${MAX_ROWS} sales at a time.`)
    const items = new Map<string, number | null>()
    for (const it of b.items as any[]) {
      const id = V.str(it?.customerId, 'Sale', { required: true })!
      if (items.has(id)) fail('The same sale is listed twice.')
      const rate = variable ? V.num(it?.rate, 'Rate', { required: true, min: 0.01 })! : null
      items.set(id, rate)
    }

    const now = new Date()
    const snap = clientSnapshot(client)
    const results = await this.prisma.$transaction([...items].map(([id, rate]) =>
      this.prisma.customer.updateMany({
        where: { id, clientId: client.id, status: CustomerStatus.APPROVED },
        data: {
          status: CustomerStatus.FINAL_APPROVED, directorId: actor.id, finalApprovedAt: now,
          ...snap, saleRateAmount: variable ? rate : client.rateOfSaleAmount,
        },
      })))
    const ids = [...items.keys()]
    const approvedIds = ids.filter((_, i) => results[i].count === 1)
    const skipped = ids.length - approvedIds.length
    return {
      approved: approvedIds.length, skipped, approvedIds,
      message: `${approvedIds.length} sale${approvedIds.length === 1 ? '' : 's'} final approved${skipped ? `; ${skipped} skipped because someone else already acted on them` : ''}.`,
    }
  }

  /** The client's sales waiting on final approval, by sale date (US business day), for Batch Reject. */
  async pending(_actor: Actor, q: Record<string, string | undefined>) {
    const client = await this.client(q.clientId)
    const from = V.date(q.dateFrom, 'From date', { required: true })!
    const to   = V.date(q.dateTo, 'To date', { required: true })!
    if (from > to) fail('From date must be on or before To date.')
    const rows = await this.prisma.customer.findMany({
      where:   { clientId: client.id, status: CustomerStatus.APPROVED, createdAt: dayRangeUtc(from, to, BUSINESS_TZ) },
      select:  {
        id: true, firstName: true, midName: true, lastName: true, phone: true, verticalType: true, createdAt: true, submittedAtEst: true,
        agent: { select: { displayName: true, firstName: true, midName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take:    MAX_ROWS,
    })
    return rows.map(r => ({
      id: r.id, name: fullName(r), phone: r.phone, verticalType: r.verticalType, agent: fullName(r.agent),
      saleDate: todayIn(BUSINESS_TZ, r.createdAt), saleTimeEst: r.submittedAtEst,
    }))
  }

  /** Final rejects the picked sales ("Rejected by Client", as a single final reject does). */
  async reject(actor: Actor, b: Record<string, any>) {
    const client = await this.client(b.clientId)
    if (!Array.isArray(b.ids) || !b.ids.length) fail('Pick at least one sale to reject.')
    if (b.ids.length > MAX_ROWS) fail(`At most ${MAX_ROWS} sales at a time.`)
    const ids = [...new Set((b.ids as unknown[]).map(v => V.str(v, 'Sale', { required: true })!))]
    const res = await this.prisma.customer.updateMany({
      where: { id: { in: ids }, clientId: client.id, status: CustomerStatus.APPROVED },
      data: {
        status: CustomerStatus.FINAL_DISAPPROVED, directorId: actor.id,
        reason: 'Rejected by Client', finalNote: 'Rejected by Client', finalDisapprovedAt: new Date(),
        ...clientSnapshot(client),
      },
    })
    const skipped = ids.length - res.count
    return {
      rejected: res.count, skipped,
      message: `${res.count} sale${res.count === 1 ? '' : 's'} final rejected${skipped ? `; ${skipped} skipped because someone else already acted on them` : ''}.`,
    }
  }

  private readRows(v: unknown): InRow[] {
    if (!Array.isArray(v) || !v.length) fail('The sheet has no rows to check.')
    if (v.length > MAX_ROWS) fail(`The sheet has more than ${MAX_ROWS} rows. Split it into smaller files.`)
    return (v as any[]).map((r, i) => ({
      row:   Number.isInteger(r?.row) ? r.row : i + 2,
      phone: String(r?.phone ?? '').slice(0, 40),
      rate:  r?.rate === null || r?.rate === undefined ? null : String(r.rate).slice(0, 30),
      date:  r?.date === null || r?.date === undefined ? null : String(r.date).slice(0, 40),
    }))
  }
}
