import { CustomerStatus } from '@crm/shared'

export const PKT_TZ = 'Asia/Karachi'
// Sales reporting runs on the US Eastern date so a full PKT night shift stays on one day.
export const BUSINESS_TZ = 'America/New_York'

export function dateIn(tz: string, d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

export const businessToday = () => dateIn(BUSINESS_TZ)
export const pktToday = () => dateIn(PKT_TZ)

const pad = (n: number) => String(n).padStart(2, '0')
const parts = (s: string) => s.split('-').map(Number)
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

export function addDaysStr(s: string, n: number) {
  const [y, m, d] = parts(s)
  return fromUtc(new Date(Date.UTC(y, m - 1, d + n)))
}
export function weekStartStr(s: string) {
  const [y, m, d] = parts(s)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDaysStr(s, -((dow + 6) % 7))
}
export function monthStartStr(s: string) { const [y, m] = parts(s); return `${y}-${pad(m)}-01` }
export function monthEndStr(s: string) {
  const [y, m] = parts(s)
  return fromUtc(new Date(Date.UTC(y, m, 0)))
}

export type PeriodKey = 'today' | 'week' | 'month' | 'all' | 'custom'

/** Same rules as Laravel's period buttons: week = Monday through today, month = 1st through today. */
export function periodDates(period: PeriodKey, today = businessToday()): { dateFrom: string; dateTo: string } | null {
  if (period === 'today') return { dateFrom: today, dateTo: today }
  if (period === 'week')  return { dateFrom: weekStartStr(today), dateTo: today }
  if (period === 'month') return { dateFrom: monthStartStr(today), dateTo: today }
  if (period === 'all')   return { dateFrom: '', dateTo: '' }
  return null
}

/** "12 May 2026 · 07:47 AM PKT" */
export function fmtWithPKT(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: PKT_TZ })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: PKT_TZ })
  return `${date} · ${time} PKT`
}

/** "12 May 2026 02:47 AM PKT" → "02:47 AM" */
export function stampTime(stamp: string | null | undefined): string {
  const p = stamp?.split(' ')
  return p && p.length >= 5 ? `${p[3]} ${p[4]}` : 'N/A'
}

export function fmtDay(iso: string | null | undefined, tz?: string): string {
  if (!iso) return 'N/A'
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00Z`) : new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: iso.length === 10 ? 'UTC' : tz })
}

export const money = (v: unknown, prefix = '$') =>
  `${prefix}${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const usd = (v: unknown) => money(v, '$')
export const pkr = (v: unknown) => `PKR ${Number(v ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const STATUS_LABEL: Record<string, string> = {
  [CustomerStatus.PENDING]:           'Pending',
  [CustomerStatus.APPROVED]:          'Approved by Manager',
  [CustomerStatus.DISAPPROVED]:       'Rejected by Manager',
  [CustomerStatus.FINAL_APPROVED]:    'Final Approved',
  [CustomerStatus.FINAL_DISAPPROVED]: 'Final Rejected',
  [CustomerStatus.AGENT_REJECTED]:    'Rejected by Agent',
}

export const STATUS_BADGE: Record<string, string> = {
  [CustomerStatus.PENDING]:           'bg-yellow-100 text-yellow-700',
  [CustomerStatus.APPROVED]:          'bg-blue-100 text-blue-700',
  [CustomerStatus.DISAPPROVED]:       'bg-red-100 text-red-700',
  [CustomerStatus.FINAL_APPROVED]:    'bg-green-100 text-green-700',
  [CustomerStatus.FINAL_DISAPPROVED]: 'bg-gray-100 text-gray-600',
  [CustomerStatus.AGENT_REJECTED]:    'bg-orange-100 text-orange-700',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export const fullName = (c: { firstName?: string | null; midName?: string | null; lastName?: string | null }) =>
  [c.firstName, c.midName, c.lastName].filter(Boolean).join(' ')
