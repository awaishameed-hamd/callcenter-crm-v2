'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import DataTable, { Column } from '@/components/ui/DataTable'
import PillSelect from '@/components/ui/PillSelect'
import StyledSelect from '@/components/ui/StyledSelect'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'HALF_DAY'

interface ReportRow {
  userId:         string
  displayName:    string
  role:           string
  totalDays:      number
  presents:       number
  absents:        number
  late:           number
  leaves:         number
  holidays:       number
  weekends:       number
  presentPercent: number
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function AttendanceReportPage() {
  const today = new Date()
  const [month,    setMonth]    = useState(today.getMonth())
  const [year,     setYear]     = useState(today.getFullYear())
  const [rows,     setRows]     = useState<ReportRow[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance/report', { params: { month: month + 1, year } })
      setRows(data?.data ?? data ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  const handleExport = async () => {
    try {
      const { data } = await api.get('/attendance/report/export', {
        params: { month: month + 1, year },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([data]))
      const a   = document.createElement('a')
      a.href    = url
      a.download = `attendance-${MONTHS[month]}-${year}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {}
  }

  const monthOpts = MONTHS.map((m, i) => ({ value: String(i), label: m }))
  const yearOpts  = Array.from({ length: 4 }, (_, i) => ({ value: String(today.getFullYear() - 1 + i), label: String(today.getFullYear() - 1 + i) }))

  const columns: Column<ReportRow>[] = [
    { key: 'displayName',    label: 'Employee',   width: 180 },
    { key: 'role',           label: 'Role',        width: 100, render: r => r.role.charAt(0) + r.role.slice(1).toLowerCase() },
    { key: 'totalDays',      label: 'Working',     width: 90,  align: 'center' },
    { key: 'presents',       label: 'Present',     width: 90,  align: 'center', render: r => <span style={{ color: '#065F46', fontWeight: 700 }}>{r.presents}</span> },
    { key: 'absents',        label: 'Absent',      width: 90,  align: 'center', render: r => <span style={{ color: '#991B1B', fontWeight: 700 }}>{r.absents}</span> },
    { key: 'late',           label: 'Late',        width: 80,  align: 'center', render: r => <span style={{ color: '#92400E', fontWeight: 700 }}>{r.late}</span> },
    { key: 'leaves',         label: 'Leaves',      width: 80,  align: 'center', render: r => <span style={{ color: '#3730A3', fontWeight: 700 }}>{r.leaves}</span> },
    { key: 'holidays',       label: 'Holidays',    width: 90,  align: 'center' },
    { key: 'weekends',       label: 'Weekends',    width: 90,  align: 'center' },
    {
      key: 'presentPercent', label: 'Present %', width: 100, align: 'center',
      render: r => {
        const pct = r.presentPercent
        const color = pct >= 90 ? '#065F46' : pct >= 70 ? '#92400E' : '#991B1B'
        return <span style={{ fontWeight: 700, color }}>{pct}%</span>
      },
    },
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>Attendance Report</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <PillSelect value={String(month)} onChange={v => setMonth(Number(v))} options={monthOpts} minWidth={130} />
          <PillSelect value={String(year)}  onChange={v => setYear(Number(v))}  options={yearOpts}  minWidth={90} />
          <button onClick={handleExport}
            style={{ padding: '6px 16px', borderRadius: 8, border: `1.5px solid ${P.teal}`, background: '#fff', color: P.teal, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary totals */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Employees', value: rows.length,                                bg: P.fillNavy, color: P.navy },
            { label: 'Avg Present', value: `${Math.round(rows.reduce((s, r) => s + r.presentPercent, 0) / rows.length)}%`, bg: '#D1FAE5', color: '#065F46' },
            { label: 'Total Absent', value: rows.reduce((s, r) => s + r.absents, 0), bg: '#FEE2E2', color: '#991B1B' },
            { label: 'Total Leaves', value: rows.reduce((s, r) => s + r.leaves, 0),  bg: '#E0E7FF', color: '#3730A3' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '10px 16px', minWidth: 120 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.color, opacity: 0.8, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <DataTable id="att-report" columns={columns} rows={rows} loading={loading} rowKey={r => r.userId} minWidth={900} />
    </div>
  )
}
