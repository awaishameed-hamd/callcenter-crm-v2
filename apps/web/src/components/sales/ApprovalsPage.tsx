'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import DataTable, { Column } from '@/components/ui/DataTable'
import PillSelect from '@/components/ui/PillSelect'
import StyledSelect from '@/components/ui/StyledSelect'

interface Sale {
  id:           string
  customerCode: string
  firstName:    string
  lastName:     string
  status:       string
  vertical:     string
  state:        string | null
  phone:        string | null
  policyNumber: string | null
  createdAt:    string
  did:          { didCode: string; campaign: string } | null
  agent:        { displayName: string; userCode: string } | null
  manager:      { displayName: string } | null
  cancelReason: string | null
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:            { bg: '#FEF3C7', color: '#92400E' },
  APPROVED:           { bg: '#DBEAFE', color: '#1E40AF' },
  DISAPPROVED:        { bg: '#FEE2E2', color: '#991B1B' },
  FINAL_APPROVED:     { bg: '#D1FAE5', color: '#065F46' },
  FINAL_DISAPPROVED:  { bg: '#FCE7F3', color: '#9D174D' },
}

const CANCEL_REASONS = ['XFER','No LA','Ringing','Over Age','Out of State','Hangup','No medicare card']

export default function ApprovalsPage() {
  const { user } = useAuth()
  const isManagerOnly = user?.role === 'MANAGER'
  const [filter,  setFilter]  = useState(isManagerOnly ? 'PENDING' : 'APPROVED')
  const [sales,   setSales]   = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [rejecting, setRejecting] = useState<{ id: string; action: 'reject' | 'final-reject' } | null>(null)
  const [reason,  setReason]  = useState('')

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/customers')
      setSales(data?.data ?? data ?? [])
    } catch { setSales([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filterOpts = isManagerOnly
    ? [{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'DISAPPROVED', label: 'Rejected' }]
    : [{ value: 'APPROVED', label: 'Approved (Pending Final)' }, { value: 'FINAL_APPROVED', label: 'Final Approved' }, { value: 'FINAL_DISAPPROVED', label: 'Final Rejected' }]

  const displayed = filter === 'ALL' ? sales : sales.filter(s => s.status === filter)

  const handleApprove = async (id: string) => {
    try { await api.post(`/customers/${id}/approve`); showToast('Approved.', true); load() }
    catch (e: any) { showToast(e?.response?.data?.message ?? 'Error', false) }
  }

  const handleFinalApprove = async (id: string) => {
    try { await api.post(`/customers/${id}/final-approve`); showToast('Final approved.', true); load() }
    catch (e: any) { showToast(e?.response?.data?.message ?? 'Error', false) }
  }

  const handleReject = async () => {
    if (!rejecting || !reason) return
    try {
      const endpoint = rejecting.action === 'reject' ? `/customers/${rejecting.id}/reject` : `/customers/${rejecting.id}/final-reject`
      await api.post(endpoint, { cancelReason: reason })
      showToast('Rejected.', true)
      setRejecting(null); setReason('')
      load()
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Error', false) }
  }

  const columns: Column<Sale>[] = [
    { key: 'customerCode', label: 'Code',     width: 110, render: r => <span style={{ fontWeight: 700, color: P.navy, fontSize: 12 }}>{r.customerCode}</span> },
    { key: 'name',         label: 'Name',     width: 150, render: r => `${r.firstName} ${r.lastName}` },
    { key: 'agent',        label: 'Agent',    width: 140, render: r => r.agent?.displayName ?? '' },
    {
      key: 'status', label: 'Status', width: 140,
      render: r => {
        const c = STATUS_COLORS[r.status] ?? { bg: '#F1F5F9', color: '#475569' }
        return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: c.bg, color: c.color }}>{r.status.replace(/_/g, ' ')}</span>
      },
    },
    { key: 'vertical', label: 'Vertical', width: 120, render: r => r.vertical.replace(/_/g, ' ') },
    { key: 'did',      label: 'DID',      width: 100, render: r => r.did?.didCode ?? '' },
    { key: 'phone',    label: 'Phone',    width: 120, render: r => r.phone ?? '' },
    { key: 'cancelReason', label: 'Reject Reason', width: 130, render: r => r.cancelReason ?? '' },
    { key: 'createdAt', label: 'Date',    width: 100, render: r => formatDate(r.createdAt) },
    {
      key: 'actions', label: 'Actions', width: 190, resizable: false,
      render: r => (
        <div style={{ display: 'flex', gap: 5 }}>
          {isManagerOnly && r.status === 'PENDING' && (
            <>
              <button onClick={() => handleApprove(r.id)}
                style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#DBEAFE', color: '#1E40AF', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>Approve</button>
              <button onClick={() => { setRejecting({ id: r.id, action: 'reject' }); setReason('') }}
                style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>Reject</button>
            </>
          )}
          {!isManagerOnly && r.status === 'APPROVED' && (
            <>
              <button onClick={() => handleFinalApprove(r.id)}
                style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#D1FAE5', color: '#065F46', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>Final Approve</button>
              <button onClick={() => { setRejecting({ id: r.id, action: 'final-reject' }); setReason('') }}
                style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>Reject</button>
            </>
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
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>Approvals</h1>
        <PillSelect value={filter} onChange={setFilter} options={filterOpts} minWidth={180} />
      </div>

      <DataTable id="approvals" columns={columns} rows={displayed} loading={loading} rowKey={r => r.id} minWidth={1000} />

      {rejecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', width: 380, maxWidth: '95vw' }}>
            <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 700, color: P.navy, margin: '0 0 16px' }}>Reason of Cancellation</h2>
            <div style={{ marginBottom: 16 }}>
              <StyledSelect value={reason} onChange={setReason}
                options={CANCEL_REASONS.map(r => ({ value: r, label: r }))} placeholder="Select reason *" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setRejecting(null); setReason('') }}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Cancel</button>
              <button onClick={handleReject} disabled={!reason}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#991B1B', color: '#fff', cursor: reason ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: reason ? 1 : 0.6 }}>Confirm Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
