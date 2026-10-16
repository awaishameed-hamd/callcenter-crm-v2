'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import DataTable, { Column } from '@/components/ui/DataTable'
import StyledSelect from '@/components/ui/StyledSelect'
import PillSelect from '@/components/ui/PillSelect'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'HALF_DAY'
type ApprovalStatus   = 'PENDING' | 'APPROVED' | 'REJECTED'

interface AttendanceRow {
  id:             string
  date:           string
  status:         AttendanceStatus
  loginTime:      string | null
  isLate:         boolean
  lateMinutes:    number | null
  notes:          string | null
  approvalStatus: ApprovalStatus | null
  approvedAt:     string | null
  approvedBy:     { displayName: string } | null
  editedBy:       { displayName: string } | null
  user:           { id: string; displayName: string; role: string }
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

export default function AttendanceApprovalPage() {
  const { user }  = useAuth()
  const today     = new Date()
  const [month,   setMonth]   = useState(today.getMonth())
  const [year,    setYear]    = useState(today.getFullYear())
  const [rows,    setRows]    = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [editing, setEditing] = useState<AttendanceRow | null>(null)
  const [editData, setEditData] = useState({ status: '', notes: '' })
  const [saving,  setSaving]  = useState(false)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance', { params: { month: month + 1, year } })
      setRows(data?.data ?? data ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/attendance/${id}/approve`)
      showToast('Attendance approved.', true)
      load()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Error', false)
    }
  }

  const handleReject = async (id: string) => {
    try {
      await api.post(`/attendance/${id}/reject`)
      showToast('Attendance rejected.', true)
      load()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Error', false)
    }
  }

  const openEdit = (row: AttendanceRow) => {
    setEditing(row)
    setEditData({ status: row.status, notes: row.notes ?? '' })
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await api.put(`/attendance/${editing.id}`, editData)
      showToast('Attendance updated.', true)
      setEditing(null)
      load()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Error', false)
    } finally {
      setSaving(false)
    }
  }

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const monthOpts = MONTHS.map((m, i) => ({ value: String(i), label: m }))
  const yearOpts  = Array.from({ length: 4 }, (_, i) => ({ value: String(today.getFullYear() - 1 + i), label: String(today.getFullYear() - 1 + i) }))

  const statusOpts = [
    { value: 'PRESENT',  label: 'Present'  },
    { value: 'ABSENT',   label: 'Absent'   },
    { value: 'LATE',     label: 'Late'     },
    { value: 'LEAVE',    label: 'Leave'    },
    { value: 'HOLIDAY',  label: 'Holiday'  },
    { value: 'HALF_DAY', label: 'Half Day' },
  ]

  const columns: Column<AttendanceRow>[] = [
    { key: 'user',    label: 'Employee',    width: 160, render: r => r.user.displayName },
    { key: 'date',    label: 'Date',        width: 110, render: r => formatDate(r.date) },
    {
      key: 'status', label: 'Status', width: 100,
      render: r => {
        const c = STATUS_COLORS[r.status]
        return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>{r.status}</span>
      },
    },
    { key: 'loginTime',   label: 'Login',     width: 90,  render: r => r.loginTime ?? 'N/A' },
    { key: 'isLate',      label: 'Late',      width: 60,  render: r => r.isLate ? 'Yes' : 'No' },
    { key: 'lateMinutes', label: 'Late (m)',  width: 80,  render: r => r.lateMinutes != null ? String(r.lateMinutes) : '' },
    {
      key: 'approvalStatus', label: 'Approval', width: 90,
      render: r => {
        if (!r.approvalStatus) return ''
        const c = r.approvalStatus === 'APPROVED' ? { bg: '#D1FAE5', text: '#065F46' }
                : r.approvalStatus === 'REJECTED'  ? { bg: '#FEE2E2', text: '#991B1B' }
                : { bg: '#FEF3C7', text: '#92400E' }
        return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>{r.approvalStatus}</span>
      },
    },
    { key: 'approvedBy', label: 'Approved By', width: 130, render: r => r.approvedBy?.displayName ?? '' },
    {
      key: 'actions', label: 'Actions', width: 200, resizable: false,
      render: r => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => openEdit(r)}
            style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${P.navy}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            Edit
          </button>
          {r.approvalStatus !== 'APPROVED' && (
            <button onClick={() => handleApprove(r.id)}
              style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#D1FAE5', color: '#065F46', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
              Approve
            </button>
          )}
          {r.approvalStatus !== 'REJECTED' && (
            <button onClick={() => handleReject(r.id)}
              style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
              Reject
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? '#065F46' : '#991B1B', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{toast.msg}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>Attendance Approval</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <PillSelect value={String(month)} onChange={v => setMonth(Number(v))} options={monthOpts} minWidth={130} />
          <PillSelect value={String(year)}  onChange={v => setYear(Number(v))}  options={yearOpts}  minWidth={90} />
        </div>
      </div>

      <DataTable id="att-approval" columns={columns} rows={rows} loading={loading} rowKey={r => r.id} minWidth={1100} />

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', width: 380, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 700, color: P.navy, margin: 0 }}>Edit Attendance</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: P.textMuted }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }}>Status</label>
              <StyledSelect value={editData.status} onChange={v => setEditData(d => ({ ...d, status: v }))} options={statusOpts} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }}>Notes</label>
              <textarea rows={3} value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${P.border}`, fontSize: 13, resize: 'vertical', fontFamily: "'Inter',sans-serif", outline: 'none', color: P.navy }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
