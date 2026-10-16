'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import DataTable, { Column } from '@/components/ui/DataTable'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'HALF_DAY'

interface DailyRow {
  id:          string
  userId:      string
  displayName: string
  role:        string
  status:      AttendanceStatus
  loginTime:   string | null
  isLate:      boolean
  lateMinutes: number | null
  notes:       string | null
}

const STATUS_COLORS: Record<AttendanceStatus, { bg: string; text: string }> = {
  PRESENT:  { bg: '#D1FAE5', text: '#065F46' },
  ABSENT:   { bg: '#FEE2E2', text: '#991B1B' },
  LATE:     { bg: '#FEF3C7', text: '#92400E' },
  LEAVE:    { bg: '#E0E7FF', text: '#3730A3' },
  HOLIDAY:  { bg: '#F0FDF4', text: '#166534' },
  WEEKEND:  { bg: '#F1F5F9', text: '#475569' },
  HALF_DAY: { bg: '#FEF9C3', text: '#713F12' },
}

export default function DailyAttendancePage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date,    setDate]    = useState(today)
  const [rows,    setRows]    = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance/daily', { params: { date } })
      setRows(data?.data ?? data ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const counts = {
    present: rows.filter(r => r.status === 'PRESENT').length,
    late:    rows.filter(r => r.status === 'LATE').length,
    absent:  rows.filter(r => r.status === 'ABSENT').length,
    leave:   rows.filter(r => r.status === 'LEAVE').length,
  }

  const columns: Column<DailyRow>[] = [
    { key: 'displayName', label: 'Employee',   width: 180 },
    { key: 'role',        label: 'Role',        width: 100, render: r => r.role.charAt(0) + r.role.slice(1).toLowerCase() },
    {
      key: 'status', label: 'Status', width: 100,
      render: r => {
        const c = STATUS_COLORS[r.status]
        return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>{r.status}</span>
      },
    },
    { key: 'loginTime',   label: 'Login Time', width: 100, render: r => r.loginTime ?? 'N/A' },
    { key: 'isLate',      label: 'Late',       width: 70,  render: r => r.isLate ? 'Yes' : 'No' },
    { key: 'lateMinutes', label: 'Late (m)',   width: 90,  render: r => r.lateMinutes != null ? String(r.lateMinutes) : '' },
    { key: 'notes',       label: 'Notes',      width: 200, render: r => r.notes ?? '' },
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>Daily Attendance</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} max={today}
          style={{ padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${P.border}`, fontSize: 13, fontFamily: "'Inter',sans-serif", color: P.navy, outline: 'none' }} />
      </div>

      {/* Counts */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Present', value: counts.present, bg: '#D1FAE5', color: '#065F46' },
            { label: 'Late',    value: counts.late,    bg: '#FEF3C7', color: '#92400E' },
            { label: 'Absent',  value: counts.absent,  bg: '#FEE2E2', color: '#991B1B' },
            { label: 'Leave',   value: counts.leave,   bg: '#E0E7FF', color: '#3730A3' },
            { label: 'Total',   value: rows.length,    bg: P.fillNavy, color: P.navy },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '10px 16px', minWidth: 100 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.color, opacity: 0.8, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <DataTable id="daily-att" columns={columns} rows={rows} loading={loading} rowKey={r => r.id || r.userId} minWidth={800} />
    </div>
  )
}
