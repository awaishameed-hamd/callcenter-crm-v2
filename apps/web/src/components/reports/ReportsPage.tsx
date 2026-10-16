'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import DataTable, { Column } from '@/components/ui/DataTable'
import StyledSelect from '@/components/ui/StyledSelect'

interface ReportRow {
  id:           string
  customerCode: string
  firstName:    string
  lastName:     string
  status:       string
  vertical:     string
  state:        string | null
  phone:        string | null
  policyNumber: string | null
  effectiveDate: string | null
  createdAt:    string
  did:          { didCode: string; campaign: string; client?: { companyName: string } } | null
  agent:        { displayName: string; userCode: string } | null
  manager:      { displayName: string } | null
  cancelReason: string | null
}

interface AgentOption { id: string; displayName: string; userCode: string }

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING:            { bg: '#FEF3C7', color: '#92400E' },
  APPROVED:           { bg: '#DBEAFE', color: '#1E40AF' },
  DISAPPROVED:        { bg: '#FEE2E2', color: '#991B1B' },
  FINAL_APPROVED:     { bg: '#D1FAE5', color: '#065F46' },
  FINAL_DISAPPROVED:  { bg: '#FCE7F3', color: '#9D174D' },
}

export default function ReportsPage() {
  const [rows,    setRows]    = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [agents,  setAgents]  = useState<AgentOption[]>([])
  const [filters, setFilters] = useState({
    from: '', to: '', status: '', vertical: '', agentId: '', didId: '',
  })

  const loadAgents = useCallback(async () => {
    try {
      const { data } = await api.get('/users/agents')
      setAgents(data?.data ?? data ?? [])
    } catch {}
  }, [])

  useEffect(() => { loadAgents() }, [loadAgents])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filters.from)    params.from    = filters.from
      if (filters.to)      params.to      = filters.to
      if (filters.status)  params.status  = filters.status
      if (filters.vertical) params.vertical = filters.vertical
      if (filters.agentId) params.agentId = filters.agentId
      if (filters.didId)   params.didId   = filters.didId
      const { data } = await api.get('/reports', { params })
      setRows(data?.data ?? data ?? [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleExport = async () => {
    try {
      const params: Record<string, string> = {}
      if (filters.from)    params.from    = filters.from
      if (filters.to)      params.to      = filters.to
      if (filters.status)  params.status  = filters.status
      if (filters.vertical) params.vertical = filters.vertical
      if (filters.agentId) params.agentId = filters.agentId
      const { data } = await api.get('/reports/export', { params, responseType: 'blob' })
      const url  = window.URL.createObjectURL(new Blob([data]))
      const a    = document.createElement('a')
      a.href     = url
      a.download = `report-${new Date().toISOString().slice(0,10)}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {}
  }

  const set = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }))

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${P.border}`,
    fontSize: 12, fontFamily: "'Inter',sans-serif", outline: 'none', color: P.navy,
  }

  const statusOpts = [
    { value: '', label: 'All Statuses' },
    { value: 'PENDING',           label: 'Pending' },
    { value: 'APPROVED',          label: 'Approved' },
    { value: 'DISAPPROVED',       label: 'Rejected' },
    { value: 'FINAL_APPROVED',    label: 'Final Approved' },
    { value: 'FINAL_DISAPPROVED', label: 'Final Rejected' },
  ]

  const verticalOpts = [
    { value: '',             label: 'All Verticals' },
    { value: 'MEDICARE',     label: 'Medicare' },
    { value: 'FINAL_EXPENSE',label: 'Final Expense' },
    { value: 'ACA',          label: 'ACA' },
    { value: 'OTHER',        label: 'Other' },
  ]

  const agentOpts = [
    { value: '', label: 'All Agents' },
    ...agents.map(a => ({ value: a.id, label: `${a.displayName} (${a.userCode})` })),
  ]

  const columns: Column<ReportRow>[] = [
    { key: 'customerCode', label: 'Code',       width: 110, render: r => <span style={{ fontWeight: 700, color: P.navy, fontSize: 12 }}>{r.customerCode}</span> },
    { key: 'name',         label: 'Name',       width: 160, render: r => `${r.firstName} ${r.lastName}` },
    { key: 'agent',        label: 'Agent',      width: 150, render: r => r.agent?.displayName ?? '' },
    {
      key: 'status', label: 'Status', width: 150,
      render: r => {
        const c = STATUS_COLORS[r.status] ?? { bg: '#F1F5F9', color: '#475569' }
        return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: c.bg, color: c.color }}>{r.status.replace(/_/g, ' ')}</span>
      },
    },
    { key: 'vertical',    label: 'Vertical',   width: 120, render: r => r.vertical.replace(/_/g, ' ') },
    { key: 'did',         label: 'DID',        width: 100, render: r => r.did?.didCode ?? '' },
    { key: 'client',      label: 'Company',    width: 140, render: r => r.did?.client?.companyName ?? '' },
    { key: 'phone',       label: 'Phone',      width: 115, render: r => r.phone ?? '' },
    { key: 'state',       label: 'State',      width: 65 },
    { key: 'policyNumber',label: 'Policy #',   width: 110, render: r => r.policyNumber ?? '' },
    { key: 'effectiveDate',label:'Eff. Date',  width: 100, render: r => r.effectiveDate ? formatDate(r.effectiveDate) : '' },
    { key: 'cancelReason',label: 'Reject',     width: 120, render: r => r.cancelReason ?? '' },
    { key: 'createdAt',   label: 'Date',       width: 100, render: r => formatDate(r.createdAt) },
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>Reports</h1>
        <button onClick={handleExport}
          style={{ padding: '7px 18px', borderRadius: 8, border: `1.5px solid ${P.teal}`, background: '#fff', color: P.teal, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${P.border}`, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: P.textLabel, marginBottom: 4 }}>From Date</label>
            <input type="date" value={filters.from} onChange={e => set('from', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: P.textLabel, marginBottom: 4 }}>To Date</label>
            <input type="date" value={filters.to} onChange={e => set('to', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: P.textLabel, marginBottom: 4 }}>Status</label>
            <StyledSelect value={filters.status} onChange={v => set('status', v)} options={statusOpts} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: P.textLabel, marginBottom: 4 }}>Vertical</label>
            <StyledSelect value={filters.vertical} onChange={v => set('vertical', v)} options={verticalOpts} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: P.textLabel, marginBottom: 4 }}>Agent</label>
            <StyledSelect value={filters.agentId} onChange={v => set('agentId', v)} options={agentOpts} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button onClick={() => setFilters({ from: '', to: '', status: '', vertical: '', agentId: '', didId: '' })}
            style={{ padding: '5px 14px', borderRadius: 7, border: `1px solid ${P.border}`, background: '#fff', color: P.textMuted, cursor: 'pointer', fontSize: 12, fontFamily: "'Inter',sans-serif" }}>
            Clear Filters
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 8 }}>{rows.length} records</div>
      <DataTable id="reports" columns={columns} rows={rows} loading={loading} rowKey={r => r.id} minWidth={1200} />
    </div>
  )
}
