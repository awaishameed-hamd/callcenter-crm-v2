'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import PillSelect from '@/components/ui/PillSelect'
import StyledSelect from '@/components/ui/StyledSelect'

type DayType = 'WORKING' | 'WEEKEND' | 'HOLIDAY' | 'HALF_DAY'

interface WorkingDay {
  id:                     string
  date:                   string
  dayType:                DayType
  leaveReason:            string | null
  reportingTimeOverride:  string | null
}

interface DayFormEntry {
  date:    string
  dayType: DayType
  leaveReason:           string
  reportingTimeOverride: string
}

const DAY_TYPE_COLORS: Record<DayType, { bg: string; text: string }> = {
  WORKING:  { bg: '#D1FAE5', text: '#065F46' },
  WEEKEND:  { bg: '#F1F5F9', text: '#475569' },
  HOLIDAY:  { bg: '#FEE2E2', text: '#991B1B' },
  HALF_DAY: { bg: '#FEF3C7', text: '#92400E' },
}

const dayTypeOpts = [
  { value: 'WORKING',  label: 'Working'  },
  { value: 'WEEKEND',  label: 'Weekend'  },
  { value: 'HOLIDAY',  label: 'Holiday'  },
  { value: 'HALF_DAY', label: 'Half Day' },
]

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function WorkingDaysPage() {
  const today = new Date()
  const [month,   setMonth]   = useState(today.getMonth())
  const [year,    setYear]    = useState(today.getFullYear())
  const [days,    setDays]    = useState<WorkingDay[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [overrides, setOverrides] = useState<Record<string, DayFormEntry>>({})

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/working-days', { params: { month: month + 1, year } })
      const list: WorkingDay[] = data?.data ?? data ?? []
      setDays(list)
      const map: Record<string, DayFormEntry> = {}
      list.forEach(d => {
        map[d.date.slice(0, 10)] = {
          date: d.date.slice(0, 10), dayType: d.dayType,
          leaveReason: d.leaveReason ?? '', reportingTimeOverride: d.reportingTimeOverride ?? '',
        }
      })
      setOverrides(map)
    } catch {
      setDays([])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay    = new Date(year, month, 1).getDay()

  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const key = d.toISOString().slice(0, 10)
    const dow = d.getDay()
    const defaultType: DayType = (dow === 0 || dow === 6) ? 'WEEKEND' : 'WORKING'
    return {
      date: key, day: i + 1, dow,
      entry: overrides[key] ?? { date: key, dayType: defaultType, leaveReason: '', reportingTimeOverride: '' },
    }
  })

  const handleChange = (date: string, field: keyof DayFormEntry, value: string) => {
    setOverrides(prev => ({
      ...prev,
      [date]: { ...(prev[date] ?? { date, dayType: 'WORKING', leaveReason: '', reportingTimeOverride: '' }), [field]: value },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries = allDays.map(d => ({
        date:    d.date,
        dayType: (overrides[d.date]?.dayType ?? d.entry.dayType) as DayType,
        leaveReason:           overrides[d.date]?.leaveReason           || undefined,
        reportingTimeOverride: overrides[d.date]?.reportingTimeOverride || undefined,
      }))
      await api.post('/working-days/setup', { month: month + 1, year, days: entries })
      showToast('Working days saved.', true)
      load()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Save failed', false)
    } finally {
      setSaving(false)
    }
  }

  const monthOpts = MONTHS.map((m, i) => ({ value: String(i), label: m }))
  const yearOpts  = Array.from({ length: 4 }, (_, i) => ({ value: String(today.getFullYear() - 1 + i), label: String(today.getFullYear() - 1 + i) }))

  const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? '#065F46' : '#991B1B', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{toast.msg}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>Working Days Setup</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PillSelect value={String(month)} onChange={v => setMonth(Number(v))} options={monthOpts} minWidth={130} />
          <PillSelect value={String(year)}  onChange={v => setYear(Number(v))}  options={yearOpts}  minWidth={90} />
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save Month'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {dayTypeOpts.map(o => {
          const c = DAY_TYPE_COLORS[o.value as DayType]
          return (
            <span key={o.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>{o.label}</span>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: P.textMuted }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: P.navy }}>
            {DOW_NAMES.map(d => (
              <div key={d} style={{ padding: '8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{d}</div>
            ))}
          </div>
          {/* Calendar cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ height: 80, borderRight: `1px solid ${P.gridLine}`, borderBottom: `1px solid ${P.gridLine}` }} />
              const d     = allDays[day - 1]
              const entry = overrides[d.date] ?? d.entry
              const col   = DAY_TYPE_COLORS[entry.dayType]
              const isToday = d.date === new Date().toISOString().slice(0, 10)
              return (
                <div key={i} style={{ borderRight: `1px solid ${P.gridLine}`, borderBottom: `1px solid ${P.gridLine}`, padding: '6px 6px 8px', background: col.bg + '33' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, borderRadius: '50%', fontSize: 12, fontWeight: isToday ? 700 : 500,
                      background: isToday ? P.teal : 'transparent', color: isToday ? '#fff' : P.navy,
                    }}>{day}</span>
                  </div>
                  <select value={entry.dayType} onChange={e => handleChange(d.date, 'dayType', e.target.value)}
                    style={{ width: '100%', fontSize: 10, padding: '2px 4px', borderRadius: 4, border: `1px solid ${P.border}`, background: '#fff', color: P.navy, fontFamily: "'Inter',sans-serif", cursor: 'pointer' }}>
                    {dayTypeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
