'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import PillSelect from '@/components/ui/PillSelect'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'HALF_DAY'

interface AttendanceRecord {
  id: string
  date: string
  status: AttendanceStatus
  loginTime: string | null
  isLate: boolean
  lateMinutes: number | null
  notes: string | null
}

interface MonthSummary {
  totalWorkingDays: number
  presents: number
  absents: number
  late: number
  leaves: number
  holidays: number
  weekends: number
  presentPercent: number
}

const STATUS_COLORS: Record<AttendanceStatus, { bg: string; text: string; label: string }> = {
  PRESENT:  { bg: '#D1FAE5', text: '#065F46', label: 'Present' },
  ABSENT:   { bg: '#FEE2E2', text: '#991B1B', label: 'Absent' },
  LATE:     { bg: '#FEF3C7', text: '#92400E', label: 'Late' },
  LEAVE:    { bg: '#E0E7FF', text: '#3730A3', label: 'Leave' },
  HOLIDAY:  { bg: '#F0FDF4', text: '#166534', label: 'Holiday' },
  WEEKEND:  { bg: '#F1F5F9', text: '#475569', label: 'Weekend' },
  HALF_DAY: { bg: '#FEF9C3', text: '#713F12', label: 'Half Day' },
}

function StatusPill({ status }: { status: AttendanceStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.text, fontFamily: "'Inter', sans-serif",
    }}>
      {c.label}
    </span>
  )
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

export default function MyAttendancePage() {
  const { user } = useAuth()
  const today    = new Date()
  const [month,     setMonth]     = useState(today.getMonth())
  const [year,      setYear]      = useState(today.getFullYear())
  const [view,      setView]      = useState<'calendar' | 'list'>('calendar')
  const [records,   setRecords]   = useState<AttendanceRecord[]>([])
  const [summary,   setSummary]   = useState<MonthSummary | null>(null)
  const [loading,   setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance/my', { params: { month: month + 1, year } })
      const d = data?.data ?? data
      setRecords(d.records ?? [])
      setSummary(d.summary ?? null)
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  const recordMap = Object.fromEntries(
    records.map(r => [r.date.slice(0, 10), r])
  )

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay    = new Date(year, month, 1).getDay()

  const STAT_CARDS = [
    { label: 'Working Days', value: summary?.totalWorkingDays ?? 0, bg: P.fillNavy, color: P.navy },
    { label: 'Present',      value: summary?.presents          ?? 0, bg: '#D1FAE5', color: '#065F46' },
    { label: 'Absent',       value: summary?.absents           ?? 0, bg: '#FEE2E2', color: '#991B1B' },
    { label: 'Late',         value: summary?.late              ?? 0, bg: '#FEF3C7', color: '#92400E' },
    { label: 'Leaves',       value: summary?.leaves            ?? 0, bg: '#E0E7FF', color: '#3730A3' },
    { label: 'Holidays',     value: summary?.holidays          ?? 0, bg: '#F0FDF4', color: '#166534' },
    { label: 'Weekends',     value: summary?.weekends          ?? 0, bg: '#F1F5F9', color: '#475569' },
    { label: 'Present %',    value: `${summary?.presentPercent ?? 0}%`, bg: P.fillTeal, color: P.teal },
  ]

  const yearOpts  = Array.from({ length: 5 }, (_, i) => ({ value: String(today.getFullYear() - 2 + i), label: String(today.getFullYear() - 2 + i) }))
  const monthOpts = MONTHS.map((m, i) => ({ value: String(i), label: m }))

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>My Attendance</h1>
          <p style={{ fontSize: 13, color: P.textMuted, margin: '3px 0 0' }}>{user?.displayName}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <PillSelect value={String(month)} onChange={v => setMonth(Number(v))} options={monthOpts} minWidth={130} />
          <PillSelect value={String(year)}  onChange={v => setYear(Number(v))}  options={yearOpts}  minWidth={90} />
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${P.border}` }}>
            {(['calendar','list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: view === v ? P.navy : '#fff', color: view === v ? '#fff' : P.navy,
                  fontFamily: "'Inter', sans-serif",
                }}>
                {v === 'calendar' ? '📅 Calendar' : '≡ List'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {STAT_CARDS.map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: s.color, opacity: 0.8, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: P.textMuted }}>Loading…</div>
      ) : view === 'calendar' ? (
        <CalendarView year={year} month={month} daysInMonth={daysInMonth} firstDay={firstDay} recordMap={recordMap} />
      ) : (
        <ListView records={records} />
      )}
    </div>
  )
}

function CalendarView({ year, month, daysInMonth, firstDay, recordMap }: {
  year: number; month: number; daysInMonth: number; firstDay: number
  recordMap: Record<string, AttendanceRecord>
}) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: P.navy }}>
        {days.map(d => (
          <div key={d} style={{ padding: '8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} style={{ height: 70, borderRight: `1px solid ${P.gridLine}`, borderBottom: `1px solid ${P.gridLine}` }} />
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const rec = recordMap[key]
          const isToday = key === new Date().toISOString().slice(0, 10)
          const status = rec?.status
          const col = status ? STATUS_COLORS[status] : null

          return (
            <div key={i} style={{
              height: 70, padding: '6px 8px', borderRight: `1px solid ${P.gridLine}`, borderBottom: `1px solid ${P.gridLine}`,
              background: col ? col.bg + '44' : isToday ? P.fillTeal : '#fff',
              position: 'relative',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: '50%', fontSize: 12, fontWeight: isToday ? 700 : 500,
                background: isToday ? P.teal : 'transparent', color: isToday ? '#fff' : P.navy,
              }}>{day}</span>
              {status && (
                <div style={{ marginTop: 4, fontSize: 9, fontWeight: 700, color: col!.text }}>{col!.label.toUpperCase()}</div>
              )}
              {rec?.loginTime && (
                <div style={{ fontSize: 9, color: P.textMuted }}>{rec.loginTime}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ListView({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: P.textMuted }}>No records.</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#F2AC18' }}>
            {['Date','Status','Login Time','Late','Late (mins)','Notes'].map(h => (
              <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#1a1a1a' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${P.gridLine}` }}>
              <td style={{ padding: '8px 14px', fontSize: 13, color: P.navy, fontWeight: 600 }}>{formatDate(r.date)}</td>
              <td style={{ padding: '8px 14px' }}><StatusPill status={r.status} /></td>
              <td style={{ padding: '8px 14px', fontSize: 12, color: P.slate }}>{r.loginTime ?? 'N/A'}</td>
              <td style={{ padding: '8px 14px', fontSize: 12, color: r.isLate ? '#92400E' : P.textMuted }}>{r.isLate ? 'Yes' : 'No'}</td>
              <td style={{ padding: '8px 14px', fontSize: 12, color: P.slate }}>{r.lateMinutes ?? 'N/A'}</td>
              <td style={{ padding: '8px 14px', fontSize: 12, color: P.textMuted }}>{r.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
