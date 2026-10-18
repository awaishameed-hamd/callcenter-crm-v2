'use client'

import { useState, useEffect, useCallback } from 'react'
import { CustomerStatus, Role } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import PillSelect from '@/components/ui/PillSelect'
import DataTable, { type Column } from '@/components/ui/DataTable'
import { PageShell, PageHeader, FilterBar, FilterSep, FilterPills, FilterDate, FilterButton, FilterCount, SecondaryButton, DownloadIcon, ColumnPicker, Pager } from '@/components/ui/PageChrome'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet, downloadBlob } from '@/lib/api'
import { STATUS_BADGE, STATUS_LABEL, periodDates, stampTime, fmtDay, BUSINESS_TZ, type PeriodKey } from '@/lib/format'
import { isFinalApprover } from '@/lib/roles'
import type { Customer, Page, Client } from '@/types'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useVerticals } from '@/lib/verticals'

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as CustomerStatus[]
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' },
  { key: 'all', label: 'Overall' }, { key: 'custom', label: 'Custom' },
]
const FROZEN: string[] = [CustomerStatus.FINAL_APPROVED, CustomerStatus.DISAPPROVED, CustomerStatus.FINAL_DISAPPROVED]
type Col = { key: string; label: string; w: number; show: boolean; minW?: number }
type Filters = { status: string; agentId: string; clientId: string; companyName: string; verticalType: string; dateFrom: string; dateTo: string }

const snapDid     = (c: Customer) => (FROZEN.includes(c.status) && c.saleDidCode ? c.saleDidCode : c.client?.didCode) ?? null
const snapCompany = (c: Customer) => (FROZEN.includes(c.status) && c.saleCompanyName ? c.saleCompanyName : c.client?.companyName) ?? null
const snapRateType = (c: Customer) => (FROZEN.includes(c.status) && c.saleRateType ? c.saleRateType : c.client?.rateType) ?? null
function snapRate(c: Customer) {
  if (FROZEN.includes(c.status) && c.saleRateType) return c.saleRateAmount != null ? `$${Number(c.saleRateAmount).toLocaleString()}` : 'N/A'
  if (!c.client) return 'N/A'
  if (c.client.rateType === 'variable') return 'Variable'
  return c.client.rateOfSaleAmount ? `$${Number(c.client.rateOfSaleAmount).toLocaleString()}` : 'N/A'
}
function rejectionReason(c: Customer) {
  if (c.status === CustomerStatus.AGENT_REJECTED)    return c.reason ?? 'N/A'
  if (c.status === CustomerStatus.DISAPPROVED)       return c.managerNote ?? 'N/A'
  if (c.status === CustomerStatus.FINAL_DISAPPROVED) return c.finalNote ?? 'N/A'
  return 'N/A'
}

function buildCols(canSeeAgent: boolean, canSeeCompany: boolean): Col[] {
  const cols: Col[] = [
    { key: 'code', label: 'Code', w: 105, show: true },
    { key: 'name', label: 'Name', w: 165, show: true },
    { key: 'status', label: 'Status', w: 158, show: true },
    { key: 'vertical', label: 'Vertical', w: 115, show: true },
  ]
  if (canSeeAgent) cols.push({ key: 'agent', label: 'Agent', w: 110, show: true })
  cols.push({ key: 'did', label: 'DID', w: 78, show: true }, { key: 'saleType', label: 'Sale Type', w: 80, show: true })
  if (canSeeCompany) cols.push({ key: 'client', label: 'Client', w: 140, show: true }, { key: 'rateType', label: 'Rate Type', w: 88, show: true }, { key: 'rate', label: 'Rate', w: 88, show: true })
  cols.push(
    { key: 'rejReason', label: 'Rejection Reason', w: 155, show: true },
    { key: 'pakTime', label: 'Pak Time', w: 88, show: true },
    { key: 'estTime', label: 'USA Time', w: 88, show: true },
    { key: 'date', label: 'Date', w: 90, show: true, minW: 90 },
  )
  return cols
}

function SaleTypePill({ v }: { v?: string | null }) {
  if (!v) return <span className="text-gray-400 text-xs">N/A</span>
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${v === 'CPA' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'}`}>{v}</span>
}
function RateTypePill({ v }: { v?: string | null }) {
  if (!v) return <span className="text-gray-400 text-xs">N/A</span>
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${v === 'fixed' ? 'bg-slate-100 text-slate-700' : 'bg-orange-100 text-orange-700'}`}>{v === 'fixed' ? 'Fixed' : 'Variable'}</span>
}

function cell(col: Col, c: Customer) {
  switch (col.key) {
    case 'code':     return <span style={{ fontSize: 12, fontWeight: 700, color: P.teal, letterSpacing: '0.04em' }}>{c.customerCode}</span>
    case 'name':     return <span style={{ fontWeight: 600, color: P.textHeading }}>{c.firstName} {c.lastName}</span>
    case 'status':   return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
    case 'vertical': return <span className="truncate block text-xs text-gray-600">{c.verticalType ?? 'N/A'}</span>
    case 'agent':    return <span className="truncate block text-xs font-bold text-gray-700">{c.agent?.displayName ?? 'N/A'}</span>
    case 'did':      return <span className="font-mono text-xs text-gray-700">{snapDid(c) ?? 'N/A'}</span>
    case 'saleType': return <SaleTypePill v={c.client?.saleType} />
    case 'client':   return <span className="truncate block text-xs text-gray-700">{snapCompany(c) ?? 'N/A'}</span>
    case 'rateType': return <RateTypePill v={snapRateType(c)} />
    case 'rate':     return <span className="text-xs text-gray-700">{snapRate(c)}</span>
    case 'rejReason': {
      const r = rejectionReason(c)
      return <span className={`truncate block text-xs font-medium ${r !== 'N/A' ? 'text-red-600' : 'text-gray-400'}`}>{r}</span>
    }
    case 'pakTime':  return <span className="font-mono text-xs text-gray-600 whitespace-nowrap">{stampTime(c.submittedAtPak)}</span>
    case 'estTime':  return <span className="font-mono text-xs text-gray-600 whitespace-nowrap">{stampTime(c.submittedAtEst)}</span>
    case 'date':     return <span className="text-xs text-gray-600 whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: BUSINESS_TZ })}</span>
    default:         return null
  }
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-gray-800">{value ?? 'N/A'}</div>
    </div>
  )
}
function MS({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="-mx-6 px-6 py-1.5 mb-3" style={{ background: 'rgba(61,71,83,0.08)', borderTop: '1px solid rgba(92,109,130,0.18)', borderBottom: '1px solid rgba(92,109,130,0.18)' }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: P.navy, fontFamily: "'Aptos', sans-serif" }}>{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  )
}

function SaleDetailModal({ c, onClose, canSeeCompany }: { c: Customer; onClose: () => void; canSeeCompany: boolean }) {
  const extras = Object.entries(c.extraFields ?? {}).filter(([, v]) => v !== null && v !== '')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        <div className="flex items-start justify-between px-6 py-4 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0E5F6E 0%, #1E8496 100%)', borderBottom: '1px solid #1A7888' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#FFFFFF', letterSpacing: '0.06em' }}>{c.firstName} {c.midName ? c.midName + ' ' : ''}{c.lastName}</h2>
            <p className="text-xs font-mono font-bold mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>{c.customerCode}</p>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
            <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors ml-1" aria-label="Close">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <MS title="Personal Information">
            <DR label="First Name" value={c.firstName} /><DR label="Last Name" value={c.lastName} />
            {c.midName && <DR label="Middle Name" value={c.midName} />}
            <DR label="Age" value={c.age} /><DR label="Date of Birth" value={c.dateOfBirth ? fmtDay(c.dateOfBirth.slice(0, 10)) : null} />
            <DR label="Phone" value={c.phone} />
          </MS>
          <MS title="Address">
            <div className="col-span-2"><DR label="Street Address" value={c.address} /></div>
            <DR label="City" value={c.city} /><DR label="State" value={c.state} /><DR label="ZIP Code" value={c.postalCode} />
          </MS>
          <MS title="Business Information">
            <DR label="Vertical" value={c.verticalType} /><DR label="DID" value={snapDid(c)} />
            <DR label="Sale Type" value={c.client?.saleType ? <SaleTypePill v={c.client.saleType} /> : null} />
            {canSeeCompany && <DR label="Client" value={snapCompany(c)} />}
            {canSeeCompany && snapRateType(c) && <DR label="Rate Type" value={<RateTypePill v={snapRateType(c)} />} />}
            {canSeeCompany && <DR label="Rate" value={snapRate(c)} />}
          </MS>
          <MS title="Additional Information">
            <DR label="Transferred From" value={c.transferredFrom} /><DR label="Cancellation Reason" value={c.reason} />
            {extras.map(([k, v]) => <DR key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
            <div className="col-span-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Comments</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.didComments || 'N/A'}</p>
            </div>
          </MS>
          <MS title="Timestamps">
            <DR label="Pak Time" value={stampTime(c.submittedAtPak)} /><DR label="USA Time" value={stampTime(c.submittedAtEst)} />
            <DR label="Date (EST)" value={fmtDay(c.createdAt, BUSINESS_TZ)} />
            {c.agent && <DR label="Agent" value={c.agent.displayName} />}
          </MS>
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const { user } = useAuth()
  const canSeeAgent   = !!user && user.role !== Role.AGENT
  const canSeeCompany = isFinalApprover(user)
  const { verticals } = useVerticals()
  const LS_KEY = `reports_cols_v5_${user?.role ?? ''}`

  const base: Filters = { status: '', agentId: '', clientId: '', companyName: '', verticalType: '', ...periodDates('today')! }
  const [period, setPeriod]   = useState<PeriodKey>('today')
  const [filters, setFilters] = useState<Filters>(base)
  const [agents, setAgents]   = useState<{ id: string; displayName: string }[]>([])
  const [dids, setDids]       = useState<{ id: string; didCode: string }[]>([])
  const [companies, setCompanies] = useState<string[]>([])
  const [data, setData]       = useState<Page<Customer> | null>(null)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [selected, setSelected] = useState<Customer | null>(null)

  const allCols = buildCols(canSeeAgent, canSeeCompany)
  const [shown, setShown] = useState<string[]>(allCols.map(c => c.key))

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
      setShown(Array.isArray(saved) && saved.length ? saved : allCols.map(c => c.key))
    } catch { setShown(allCols.map(c => c.key)) }
  }, [user?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  const changeShown = (keys: string[]) => {
    setShown(keys)
    try { localStorage.setItem(LS_KEY, JSON.stringify(keys)) } catch { /* ignore */ }
  }

  useEffect(() => {
    if (canSeeAgent) apiGet<{ id: string; displayName: string }[]>('/users/agents').then(setAgents).catch(() => {})
    apiGet<{ id: string; didCode: string }[]>('/clients/dropdown').then(setDids).catch(() => {})
    if (canSeeCompany) {
      apiGet<Client[]>('/clients', { perPage: 'all' })
        .then(list => setCompanies(Array.from(new Set(list.map(c => c.companyName))).sort()))
        .catch(() => {})
    }
  }, [canSeeAgent, canSeeCompany])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setData(await apiGet<Page<Customer>>('/reports', { ...filters, page }))
    } catch {
      if (!silent) setToast({ message: 'Failed to load report data.', type: 'error' })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { fetchData() }, [fetchData])
  useAutoRefresh(() => fetchData(true))

  // Every filter applies as soon as it changes, the way argroup's filter bars work.
  const setF = (name: keyof Filters, value: string) => { setFilters(p => ({ ...p, [name]: value })); setPage(1) }
  const handlePeriod = (p: PeriodKey) => {
    setPeriod(p)
    const dates = periodDates(p)
    if (dates) { setFilters(prev => ({ ...prev, ...dates })); setPage(1) }
  }
  const handleReset = () => { setFilters({ ...base, ...periodDates('today')! }); setPeriod('today'); setPage(1) }
  const dirty = period !== 'today' || filters.status || filters.agentId || filters.clientId || filters.companyName || filters.verticalType

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadBlob('/reports/export', filters, `report_${new Date().toISOString().slice(0, 10)}.csv`)
    } catch {
      setToast({ message: 'Export failed. Please try again.', type: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const rows = data?.data ?? []
  const columns: Column<Customer>[] = allCols
    .filter(c => shown.includes(c.key))
    .map(c => ({ key: c.key, label: c.label, width: c.w, render: (row: Customer) => cell(c, row) }))

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <PageShell>
        <PageHeader title="Sales Report" actions={
          <SecondaryButton onClick={handleExport} disabled={exporting}><DownloadIcon /> {exporting ? 'Exporting' : 'Export CSV'}</SecondaryButton>
        } />

        <FilterBar>
          <FilterPills value={period} onChange={handlePeriod} options={PERIODS.map(p => ({ value: p.key, label: p.label }))} />
          {period === 'custom' && (
            <>
              <FilterDate value={filters.dateFrom} onChange={v => setF('dateFrom', v)} title="From" />
              <FilterDate value={filters.dateTo} onChange={v => setF('dateTo', v)} title="To" />
            </>
          )}
          <FilterSep />
          <PillSelect value={filters.status} onChange={v => setF('status', v)} dimValue="" minWidth={160}
            options={[{ value: '', label: 'All Statuses' }, ...STATUS_OPTIONS.map(s => ({ value: s, label: STATUS_LABEL[s] }))]} />
          <PillSelect value={filters.verticalType} onChange={v => setF('verticalType', v)} dimValue="" minWidth={130}
            options={[{ value: '', label: 'All Verticals' }, ...verticals.map(v => ({ value: v.name, label: v.name }))]} />
          {canSeeAgent && (
            <PillSelect value={filters.agentId} onChange={v => setF('agentId', v)} dimValue="" minWidth={140}
              options={[{ value: '', label: 'All Agents' }, ...agents.map(a => ({ value: a.id, label: a.displayName }))]} />
          )}
          <PillSelect value={filters.clientId} onChange={v => setF('clientId', v)} dimValue="" minWidth={110}
            options={[{ value: '', label: 'All DIDs' }, ...dids.map(d => ({ value: d.id, label: d.didCode }))]} />
          {canSeeCompany && (
            <PillSelect value={filters.companyName} onChange={v => setF('companyName', v)} dimValue="" minWidth={150}
              options={[{ value: '', label: 'All Clients' }, ...companies.map(c => ({ value: c, label: c }))]} />
          )}
          <FilterSep />
          <ColumnPicker columns={allCols} visible={shown} onChange={changeShown} />
          {dirty && <FilterButton onClick={handleReset}>Reset</FilterButton>}
          {data && <FilterCount>{data.total} record{data.total !== 1 ? 's' : ''}</FilterCount>}
        </FilterBar>

        <DataTable<Customer>
          id={`reports-${user?.role ?? ''}`}
          rows={rows}
          loading={loading}
          skeletonRows={10}
          rowKey={c => c.id}
          emptyText="No records found for the selected filters."
          onRowClick={c => setSelected(c)}
          columns={columns}
        />
        {data && <Pager page={data.currentPage} lastPage={data.lastPage} perPage={data.perPage} total={data.total} shown={rows.length} noun="records" onPage={setPage} />}
      </PageShell>

      {selected && <SaleDetailModal c={selected} onClose={() => setSelected(null)} canSeeCompany={canSeeCompany} />}
    </>
  )
}
