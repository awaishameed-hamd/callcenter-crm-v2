export const PKT_TZ = 'Asia/Karachi'
export const US_TZ  = 'America/New_York'

// The sales business day is the US Eastern calendar day: the 7 PM to 4 AM PKT shift
// always falls inside a single US date, whereas a PKT-midnight boundary would split it.
export const BUSINESS_TZ = US_TZ

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG  = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS_SHORT   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG    = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0'
  return {
    year:    Number(get('year')),
    month:   Number(get('month')),
    day:     Number(get('day')),
    hour:    Number(get('hour')) % 24,
    minute:  Number(get('minute')),
    second:  Number(get('second')),
    weekday: DAYS_SHORT.indexOf(get('weekday')),
  }
}

function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** UTC instant for a wall-clock time in the given zone. */
export function zonedToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, tz = PKT_TZ): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  let ts = guess - tzOffsetMs(new Date(guess), tz)
  ts = guess - tzOffsetMs(new Date(ts), tz)
  return new Date(ts)
}

export function pad(n: number, w = 2) { return String(n).padStart(w, '0') }

export function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }

export function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

export function isYmd(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const { y, m, d } = parseYmd(s)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function todayIn(tz: string, now = new Date()): string {
  const p = zonedParts(now, tz)
  return ymd(p.year, p.month, p.day)
}

export function addDays(s: string, n: number): string {
  const { y, m, d } = parseYmd(s)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

export function diffDays(from: string, to: string): number {
  const a = parseYmd(from), b = parseYmd(to)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000)
}

/** Monday of the week containing s (Carbon startOfWeek default). */
export function weekStart(s: string): string {
  const { y, m, d } = parseYmd(s)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(s, -((dow + 6) % 7))
}

export function monthStart(s: string): string { const { y, m } = parseYmd(s); return ymd(y, m, 1) }

export function monthEnd(s: string): string {
  const { y, m } = parseYmd(s)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return ymd(y, m, last)
}

export function addMonths(s: string, n: number): string {
  const { y, m } = parseYmd(s)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1)
}

/** [start, endExclusive) UTC instants covering the calendar days from..to in tz. */
export function dayRangeUtc(from: string, to: string, tz: string): { gte: Date; lt: Date } {
  const a = parseYmd(from)
  const b = parseYmd(addDays(to, 1))
  return { gte: zonedToUtc(a.y, a.m, a.d, 0, 0, 0, tz), lt: zonedToUtc(b.y, b.m, b.d, 0, 0, 0, tz) }
}

/** A Postgres DATE column value for a YYYY-MM-DD string. */
export function dateOnly(s: string): Date { return new Date(`${s}T00:00:00.000Z`) }

export function fmtDateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/** "16 Oct 2026 07:30 PM PKT" — Laravel format 'd M Y h:i A'. */
export function fmtStamp(date: Date, tz: string, label: string): string {
  const p = zonedParts(date, tz)
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  return `${pad(p.day)} ${MONTHS_SHORT[p.month - 1]} ${p.year} ${pad(h12)}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'} ${label}`
}

/** "7:05 PM" — Laravel 'g:i A'. */
export function fmtClock(date: Date, tz: string): string {
  const p = zonedParts(date, tz)
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  return `${h12}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`
}

/** "Friday, October 16, 2026" — Laravel 'l, F j, Y'. */
export function fmtLongDate(s: string): string {
  const { y, m, d } = parseYmd(s)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${DAYS_LONG[dow]}, ${MONTHS_LONG[m - 1]} ${d}, ${y}`
}

export function dayShort(s: string): string {
  const { y, m, d } = parseYmd(s)
  return DAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

export function monthShort(m: number): string { return MONTHS_SHORT[m - 1] }
export function monthLong(m: number): string { return MONTHS_LONG[m - 1] }
