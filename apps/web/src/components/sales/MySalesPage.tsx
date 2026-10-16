'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import DataTable, { Column } from '@/components/ui/DataTable'
import PillSelect from '@/components/ui/PillSelect'

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

export default function MySalesPage() {
  const [sales,   setSales]   = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/customers')
      setSales(data?.data ?? data ?? [])
    } catch {
      setSales([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filterOpts = [
    { value: 'ALL',               label: 'All' },
    { value: 'PENDING',           label: 'Pending' },
    { value: 'APPROVED',          label: 'Approved' },
    { value: 'DISAPPROVED',       label: 'Rejected' },
    { value: 'FINAL_APPROVED',    label: 'Final Approved' },
    { value: 'FINAL_DISAPPROVED', label: 'Final Rejected' },
  ]

  const displayed = filter === 'ALL' ? sales : sales.filter(s => s.status === filter)

  const columns: Column<Sale>[] = [
    { key: 'customerCode', label: 'Code',      width: 110, render: r => <span style={{ fontWeight: 700, color: P.navy, fontSize: 12 }}>{r.customerCode}</span> },
    { key: 'name',         label: 'Name',      width: 160, render: r => `${r.firstName} ${r.lastName}` },
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
    { key: 'state',    label: 'State',    width: 70 },
    { key: 'policyNumber', label: 'Policy #', width: 110, render: r => r.policyNumber ?? '' },
    { key: 'cancelReason', label: 'Reject Reason', width: 140, render: r => r.cancelReason ?? '' },
    { key: 'createdAt', label: 'Date', width: 100, render: r => formatDate(r.createdAt) },
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>My Sales</h1>
          <p style={{ fontSize: 12, color: P.textMuted, margin: '3px 0 0' }}>{displayed.length} records</p>
        </div>
        <PillSelect value={filter} onChange={setFilter} options={filterOpts} minWidth={150} />
      </div>

      <DataTable id="my-sales" columns={columns} rows={displayed} loading={loading} rowKey={r => r.id} minWidth={950} />
    </div>
  )
}
