'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import StyledSelect from '@/components/ui/StyledSelect'
import DataTable, { Column } from '@/components/ui/DataTable'

type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type LeaveType   = 'sick' | 'casual' | 'annual' | 'exam' | 'other'

interface LeaveApplication {
  id:             string
  leaveType:      LeaveType
  fromDate:       string
  toDate:         string
  reason:         string
  status:         LeaveStatus
  reviewedBy:     { displayName: string } | null
  rejectionReason: string | null
  reviewedAt:     string | null
  createdAt:      string
}

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  sick:   'Sick Leave',
  casual: 'Casual Leave',
  annual: 'Annual Leave',
  exam:   'Exam Leave',
  other:  'Other',
}

const STATUS_STYLES: Record<LeaveStatus, { bg: string; color: string }> = {
  PENDING:  { bg: '#FEF3C7', color: '#92400E' },
  APPROVED: { bg: '#D1FAE5', color: '#065F46' },
  REJECTED: { bg: '#FEE2E2', color: '#991B1B' },
}

export default function MyLeavesPage() {
  const [leaves,  setLeaves]  = useState<LeaveApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)

  const [form, setForm] = useState({
    leaveType: '',
    fromDate:  '',
    toDate:    '',
    reason:    '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/leaves/my')
      setLeaves(data?.data ?? data ?? [])
    } catch {
      setLeaves([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.leaveType) e.leaveType = 'Required'
    if (!form.fromDate)  e.fromDate  = 'Required'
    if (!form.toDate)    e.toDate    = 'Required'
    if (!form.reason.trim()) e.reason = 'Required'
    if (form.fromDate && form.toDate && form.toDate < form.fromDate)
      e.toDate = 'Must be after From Date'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      await api.post('/leaves', form)
      showToast('Leave application submitted.', true)
      setModal(false)
      setForm({ leaveType: '', fromDate: '', toDate: '', reason: '' })
      setErrors({})
      load()
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Submit failed', false)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: `1.5px solid ${P.border}`, fontSize: 13, fontFamily: "'Inter', sans-serif",
    outline: 'none', color: P.navy,
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }
  const errStyle: React.CSSProperties   = { fontSize: 11, color: '#D62828', marginTop: 3 }

  const columns: Column<LeaveApplication>[] = [
    { key: 'leaveType', label: 'Type',       width: 130, render: r => LEAVE_TYPE_LABELS[r.leaveType] },
    { key: 'fromDate',  label: 'From',        width: 110, render: r => formatDate(r.fromDate) },
    { key: 'toDate',    label: 'To',          width: 110, render: r => formatDate(r.toDate) },
    { key: 'reason',    label: 'Reason',      width: 220 },
    { key: 'status',    label: 'Status',      width: 100,
      render: r => {
        const s = STATUS_STYLES[r.status]
        return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{r.status}</span>
      },
    },
    { key: 'reviewedBy',   label: 'Reviewed By',   width: 140, render: r => r.reviewedBy?.displayName ?? '' },
    { key: 'rejectionReason', label: 'Reason (if rejected)', width: 200, render: r => r.rejectionReason ?? '' },
    { key: 'createdAt',   label: 'Applied On',  width: 110, render: r => formatDate(r.createdAt) },
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.ok ? '#065F46' : '#991B1B', color: '#fff',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>{toast.msg}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>My Leaves</h1>
        <button onClick={() => setModal(true)}
          style={{ padding: '8px 18px', borderRadius: 8, background: P.navy, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
          + Apply Leave
        </button>
      </div>

      <DataTable id="my-leaves" columns={columns} rows={leaves} loading={loading} rowKey={r => r.id} minWidth={900} />

      {/* Apply Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', width: 440, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 700, color: P.navy, margin: 0 }}>Apply for Leave</h2>
              <button onClick={() => { setModal(false); setErrors({}) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: P.textMuted }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Leave Type *</label>
                <StyledSelect value={form.leaveType} onChange={v => setForm(f => ({ ...f, leaveType: v }))}
                  options={Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  placeholder="Select leave type" borderColor={errors.leaveType ? '#D62828' : undefined} />
                {errors.leaveType && <div style={errStyle}>{errors.leaveType}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>From Date *</label>
                  <input type="date" value={form.fromDate} onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))}
                    style={{ ...inputStyle, borderColor: errors.fromDate ? '#D62828' : P.border }} />
                  {errors.fromDate && <div style={errStyle}>{errors.fromDate}</div>}
                </div>
                <div>
                  <label style={labelStyle}>To Date *</label>
                  <input type="date" value={form.toDate} onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))}
                    style={{ ...inputStyle, borderColor: errors.toDate ? '#D62828' : P.border }} />
                  {errors.toDate && <div style={errStyle}>{errors.toDate}</div>}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Reason *</label>
                <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Reason for leave…"
                  style={{ ...inputStyle, resize: 'vertical', borderColor: errors.reason ? '#D62828' : P.border }} />
                {errors.reason && <div style={errStyle}>{errors.reason}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => { setModal(false); setErrors({}) }}
                style={{ padding: '8px 18px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
