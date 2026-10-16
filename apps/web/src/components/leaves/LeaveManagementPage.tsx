'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import DataTable, { Column } from '@/components/ui/DataTable'
import PillSelect from '@/components/ui/PillSelect'

type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type LeaveType   = 'sick' | 'casual' | 'annual' | 'exam' | 'other'

interface LeaveRow {
  id:              string
  leaveType:       LeaveType
  fromDate:        string
  toDate:          string
  reason:          string
  status:          LeaveStatus
  reviewedBy:      { displayName: string } | null
  rejectionReason: string | null
  reviewedAt:      string | null
  createdAt:       string
  user:            { id: string; displayName: string; role: string }
}

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  sick:   'Sick',
  casual: 'Casual',
  annual: 'Annual',
  exam:   'Exam',
  other:  'Other',
}

const STATUS_STYLES: Record<LeaveStatus, { bg: string; color: string }> = {
  PENDING:  { bg: '#FEF3C7', color: '#92400E' },
  APPROVED: { bg: '#D1FAE5', color: '#065F46' },
  REJECTED: { bg: '#FEE2E2', color: '#991B1B' },
}

export default function LeaveManagementPage() {
  const [filter,  setFilter]  = useState<'ALL' | LeaveStatus>('ALL')
  const [rows,    setRows]    = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/leaves', { params: filter !== 'ALL' ? { status: filter } : {} })
      setRows(data?.data ?? data ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/leaves/${id}/approve`)
      showToast('Leave approved.', true)
      load()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Error', false)
    }
  }

  const handleReject = async () => {
    if (!rejecting) return
    try {
      await api.post(`/leaves/${rejecting}/reject`, { rejectionReason: rejectReason })
      showToast('Leave rejected.', true)
      setRejecting(null)
      setRejectReason('')
      load()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Error', false)
    }
  }

  const filterOpts = [
    { value: 'ALL',      label: 'All' },
    { value: 'PENDING',  label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
  ]

  const columns: Column<LeaveRow>[] = [
    { key: 'user',      label: 'Employee',  width: 160, render: r => r.user.displayName },
    { key: 'leaveType', label: 'Type',      width: 100, render: r => LEAVE_TYPE_LABELS[r.leaveType] },
    { key: 'fromDate',  label: 'From',      width: 110, render: r => formatDate(r.fromDate) },
    { key: 'toDate',    label: 'To',        width: 110, render: r => formatDate(r.toDate) },
    { key: 'reason',    label: 'Reason',    width: 220 },
    {
      key: 'status', label: 'Status', width: 100,
      render: r => {
        const s = STATUS_STYLES[r.status]
        return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{r.status}</span>
      },
    },
    { key: 'reviewedBy', label: 'Reviewed By', width: 140, render: r => r.reviewedBy?.displayName ?? '' },
    { key: 'rejectionReason', label: 'Rejection Reason', width: 180, render: r => r.rejectionReason ?? '' },
    { key: 'createdAt', label: 'Applied On',   width: 110, render: r => formatDate(r.createdAt) },
    {
      key: 'actions', label: 'Actions', width: 160, resizable: false,
      render: r => r.status !== 'PENDING' ? null : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => handleApprove(r.id)}
            style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#D1FAE5', color: '#065F46', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            Approve
          </button>
          <button onClick={() => { setRejecting(r.id); setRejectReason('') }}
            style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            Reject
          </button>
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
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>Leave Management</h1>
        <PillSelect value={filter} onChange={v => setFilter(v as any)} options={filterOpts} minWidth={120} />
      </div>

      <DataTable id="leave-mgmt" columns={columns} rows={rows} loading={loading} rowKey={r => r.id} minWidth={1100} />

      {rejecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', width: 360, maxWidth: '95vw' }}>
            <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 700, color: P.navy, margin: '0 0 16px' }}>Reject Leave</h2>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 6 }}>Reason (optional)</label>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Rejection reason…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${P.border}`, fontSize: 13, resize: 'vertical', fontFamily: "'Inter',sans-serif", outline: 'none', color: P.navy, marginBottom: 16 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setRejecting(null); setRejectReason('') }}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Cancel</button>
              <button onClick={handleReject}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#991B1B', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
