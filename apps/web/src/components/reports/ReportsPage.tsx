'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CustomerStatus, Role, VERTICALS } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet, downloadBlob } from '@/lib/api'
import { STATUS_BADGE, STATUS_LABEL, periodDates, stampTime, fmtDay, BUSINESS_TZ, type PeriodKey } from '@/lib/format'
import { isFinalApprover } from '@/lib/roles'
import type { Customer, Page, Client } from '@/types'

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as CustomerStatus[]
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' },
  { key: 'all', label: 'Overall' }, { key: 'custom', label: 'Custom' },
]
const FROZEN: string[] = [CustomerStatus.FINAL_APPROVED, CustomerStatus.DISAPPROVED, CustomerStatus.FINAL_DISAPPROVED]
const MIN_COL_W = 60

const selectCls = 'w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition cursor-pointer'
const inputCls  = 'w-full rounded-lg px-2.5 py-1.5 text-xs outline-none transition'
const labelCls  = 'block text-xs font-bold uppercase tracking-widest mb-0.5'
const darkField: React.CSSProperties = { background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }
const optionStyle: React.CSSProperties = { color: '#132E57' }

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
    case 'code':     return <span className="font-mono text-xs font-bold text-gray-700 truncate block">{c.customerCode}</span>
    case 'name':     return <span className="font-medium text-gray-800 truncate block">{c.firstName} {c.lastName}</span>
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
        <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#111827', fontFamily: "'Rajdhani',sans-serif" }}>{title}</span>
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
  const LS_KEY = `reports_cols_v4_${user?.role ?? ''}`

  const base: Filters = { status: '', agentId: '', clientId: '', companyName: '', verticalType: '', ...periodDates('today')! }
  const [period, setPeriod]   = useState<PeriodKey>('today')
  const [filters, setFilters] = useState<Filters>(base)
  const [applied, setApplied] = useState<Filters>(base)
  const [agents, setAgents]   = useState<{ id: string; displayName: string }[]>([])
  const [dids, setDids]       = useState<{ id: string; didCode: string }[]>([])
  const [companies, setCompanies] = useState<string[]>([])
  const [data, setData]       = useState<Page<Customer> | null>(null)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)

  const defaults = buildCols(canSeeAgent, canSeeCompany)
  const [cols, setCols] = useState<Col[]>(defaults)
  const resizingRef  = useRef<{ key: string; nextKey?: string; startX: number; startW: number; nextStartW: number; colMin: number; nextMin: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userResized  = useRef(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
      if (Array.isArray(saved) && saved.length) {
        setCols(defaults.map(d => { const s = saved.find((x: Col) => x.key === d.key); return s ? { ...d, w: s.w ?? d.w, show: s.show ?? d.show } : d }))
        return
      }
    } catch { /* ignore */ }
    const w = containerRef.current?.clientWidth ?? 0
    if (w > 0) {
      const total = defaults.reduce((s, c) => s + c.w, 0)
      setCols(defaults.map(c => ({ ...c, w: Math.max(c.minW ?? MIN_COL_W, Math.floor(c.w * (w / total))) })))
    }
  }, [user?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userResized.current) return
    try { localStorage.setItem(LS_KEY, JSON.stringify(cols.map(c => ({ key: c.key, w: c.w, show: c.show })))) } catch { /* ignore */ }
  }, [cols, LS_KEY])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      let d = e.clientX - r.startX
      if (r.startW + d < r.colMin) d = r.colMin - r.startW
      if (r.nextKey && r.nextStartW - d < r.nextMin) d = r.nextStartW - r.nextMin
      setCols(prev => prev.map(c => c.key === r.key ? { ...c, w: r.startW + d } : c.key === r.nextKey ? { ...c, w: r.nextStartW - d } : c))
    }
    const onUp = () => { resizingRef.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  useEffect(() => {
    if (canSeeAgent) apiGet<{ id: string; displayName: string }[]>('/users/agents').then(setAgents).catch(() => {})
    apiGet<{ id: string; didCode: string }[]>('/clients/dropdown').then(setDids).catch(() => {})
    if (canSeeCompany) {
      apiGet<Client[]>('/clients', { perPage: 'all' })
        .then(list => setCompanies(Array.from(new Set(list.map(c => c.companyName))).sort()))
        .catch(() => {})
    }
  }, [canSeeAgent, canSeeCompany])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      setData(await apiGet<Page<Customer>>('/reports', { ...applied, page }))
    } catch {
      setToast({ message: 'Failed to load report data.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [applied, page])

  useEffect(() => { fetchData() }, [fetchData])

  const handlePeriod = (p: PeriodKey) => {
    setPeriod(p)
    const dates = periodDates(p)
    if (!dates) return
    setFilters(prev => ({ ...prev, ...dates }))
    setApplied(prev => ({ ...prev, ...dates }))
    setPage(1)
  }
  const setF = (name: keyof Filters, value: string) => setFilters(p => ({ ...p, [name]: value }))
  const handleApply = (e: React.FormEvent) => { e.preventDefault(); setApplied(filters); setPage(1) }
  const handleReset = () => {
    const reset = { ...base, ...periodDates('today')! }
    setFilters(reset); setApplied(reset); setPeriod('today'); setPage(1)
  }

  const toggleCol = (key: string) => {
    userResized.current = true
    setCols(prev => {
      const next = prev.map(c => (c.key === key ? { ...c, show: !c.show } : c))
      const w = containerRef.current?.clientWidth ?? 0
      const total = next.filter(c => c.show).reduce((s, c) => s + c.w, 0)
      if (!total || !w) return next
      return next.map(c => (c.show ? { ...c, w: Math.max(c.minW ?? MIN_COL_W, Math.floor(c.w * (w / total))) } : c))
    })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadBlob('/reports/export', applied, `report_${new Date().toISOString().slice(0, 10)}.csv`)
    } catch {
      setToast({ message: 'Export failed. Please try again.', type: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const visible = cols.filter(c => c.show)
  const rows = data?.data ?? []

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="p-5 space-y-4 flex flex-col" style={{ background: '#EDF0F3', minHeight: '100vh' }}>
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-2xl font-black" style={{ color: '#132E57', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>Sales Report</h1>
            <p className="text-sm mt-0.5" style={{ color: '#5C5C5C' }}>Filter and export customer data. Days follow US Eastern time.</p>
          </div>
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-60">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            {exporting ? 'Exporting' : 'Export CSV'}
          </button>
        </div>

        <form onSubmit={handleApply} className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5 shadow-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0E5F6E 0%, #1E8496 100%)', border: '1px solid #1A7888' }}>
          <div className="flex items-end gap-2.5 overflow-x-auto pb-0.5 w-full">
            <div className="flex-shrink-0">
              <label className={labelCls} style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>Period</label>
              <div className="flex gap-1">
                {PERIODS.map(btn => (
                  <button key={btn.key} type="button" onClick={() => handlePeriod(btn.key)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all"
                    style={period === btn.key
                      ? { background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)', color: '#fff', fontFamily: "'Rajdhani',sans-serif", letterSpacing: '0.04em' }
                      : { background: 'rgba(0,0,0,0.15)', color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
            {period === 'custom' && (
              <>
                <div className="flex-shrink-0 w-[130px]">
                  <label className={labelCls} style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>From</label>
                  <DateInput value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} className={inputCls} style={darkField} />
                </div>
                <div className="flex-shrink-0 w-[130px]">
                  <label className={labelCls} style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>To</label>
                  <DateInput value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)} className={inputCls} style={darkField} />
                </div>
              </>
            )}
            <div className="flex-shrink-0 w-[150px]">
              <label className={labelCls} style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>Status</label>
              <select value={filters.status} onChange={e => setF('status', e.target.value)} className={selectCls} style={darkField}>
                <option value="" style={optionStyle}>All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s} style={optionStyle}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="flex-shrink-0 w-[120px]">
              <label className={labelCls} style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>Vertical</label>
              <select value={filters.verticalType} onChange={e => setF('verticalType', e.target.value)} className={selectCls} style={darkField}>
                <option value="" style={optionStyle}>All Verticals</option>
                {VERTICALS.map(v => <option key={v} value={v} style={optionStyle}>{v}</option>)}
              </select>
            </div>
            {canSeeAgent && (
              <div className="flex-shrink-0 w-[130px]">
                <label className={labelCls} style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>Agent</label>
                <select value={filters.agentId} onChange={e => setF('agentId', e.target.value)} className={selectCls} style={darkField}>
                  <option value="" style={optionStyle}>All Agents</option>
                  {agents.map(a => <option key={a.id} value={a.id} style={optionStyle}>{a.displayName}</option>)}
                </select>
              </div>
            )}
            <div className="flex-shrink-0 w-[100px]">
              <label className={labelCls} style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>DID</label>
              <select value={filters.clientId} onChange={e => setF('clientId', e.target.value)} className={selectCls} style={darkField}>
                <option value="" style={optionStyle}>All DIDs</option>
                {dids.map(d => <option key={d.id} value={d.id} style={optionStyle}>{d.didCode}</option>)}
              </select>
            </div>
            {canSeeCompany && (
              <div className="flex-shrink-0 w-[150px]">
                <label className={labelCls} style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>Client</label>
                <select value={filters.companyName} onChange={e => setF('companyName', e.target.value)} className={selectCls} style={darkField}>
                  <option value="" style={optionStyle}>All Clients</option>
                  {companies.map(c => <option key={c} value={c} style={optionStyle}>{c}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-1.5 flex-shrink-0 ml-auto pl-2">
              <button type="button" onClick={handleReset} className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all hover:bg-white/10"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>Reset</button>
              <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shadow-sm"
                style={{ background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)', color: '#fff', fontFamily: "'Rajdhani',sans-serif", letterSpacing: '0.05em' }}>Apply</button>
            </div>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-gray-700">Results</h2>
              {data && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{data.total} record{data.total !== 1 ? 's' : ''}</span>}
            </div>
            <div className="relative">
              <button onClick={() => setColMenuOpen(o => !o)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors select-none">Columns</button>
              {colMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[175px]">
                    <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 mb-1">Toggle Columns</p>
                    {cols.map(col => (
                      <label key={col.key} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-gray-50 select-none">
                        <input type="checkbox" checked={col.show} onChange={() => toggleCol(col.key)} className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
                        <span className="text-xs text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div ref={containerRef} className="overflow-x-auto flex-1">
            <table className="text-sm border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: '100%', minWidth: visible.reduce((s, c) => s + Math.min(c.w, 120), 0) }}>
              <colgroup>{visible.map(col => <col key={col.key} style={{ width: col.w }} />)}</colgroup>
              <thead>
                <tr style={{ background: 'linear-gradient(90deg, #4A5568 0%, #5A6880 100%)' }}>
                  {visible.map((col, idx) => (
                    <th key={col.key} className="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-widest select-none relative" style={{ color: '#FFFFFF', fontFamily: "'Rajdhani',sans-serif" }}>
                      <span className="block leading-tight whitespace-normal break-words">{col.label}</span>
                      {idx < visible.length - 1 && (
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center"
                          onMouseDown={e => {
                            e.preventDefault()
                            userResized.current = true
                            const next = visible[idx + 1]
                            resizingRef.current = { key: col.key, nextKey: next?.key, startX: e.clientX, startW: col.w, nextStartW: next?.w ?? 0, colMin: col.minW ?? MIN_COL_W, nextMin: next?.minW ?? MIN_COL_W }
                          }}>
                          <div className="w-px h-4 rounded-full" style={{ background: '#5C6D82' }} />
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      {visible.map(col => <td key={col.key} className="px-3 py-2.5 border-b border-gray-50"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>)}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr><td colSpan={visible.length} className="px-4 py-12 text-center text-gray-400 text-sm">No records found for the selected filters.</td></tr>
                ) : rows.map((c, idx) => (
                  <tr key={c.id} onClick={() => setSelected(c)} className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    {visible.map(col => <td key={col.key} className="px-3 py-2 border-b border-gray-50 overflow-hidden">{cell(col, c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.lastPage > 1 && (
            <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-white">
              <p className="text-xs text-gray-500">Page {data.currentPage} of {data.lastPage}, {data.total} total</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={data.currentPage === 1} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">Previous</button>
                <span className="text-xs text-gray-400 px-1">{data.currentPage} / {data.lastPage}</span>
                <button onClick={() => setPage(p => Math.min(data.lastPage, p + 1))} disabled={data.currentPage === data.lastPage} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && <SaleDetailModal c={selected} onClose={() => setSelected(null)} canSeeCompany={canSeeCompany} />}
    </>
  )
}
