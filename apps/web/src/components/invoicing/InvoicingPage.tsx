'use client'

import { useState, useEffect, useCallback } from 'react'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import { apiGet, apiPost, errMsg } from '@/lib/api'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { usd } from '@/lib/format'
import { PageTitle } from '@/components/ui/PageChrome'

const P = {
  navy: '#132E57', teal: '#1E8496', tealDk: '#0E5F6E', gold: '#D7A520',
  orange: '#C25A1F', green: '#3A6B3A', gray: '#5C5C5C', bg: '#EDF0F3',
}

type ToastState = { message: string; type: 'success' | 'error' } | null
type RevenueRow = { label: string; sublabel: string; expected: number; confirmed: number; invoice: number }
type Pending = { clientId: string; companyName: string; didCode: string | null; periodStart: string; periodEnd: string; salesCount: number; subtotal: number; cycleDays: number }
type Invoice = {
  id: string; invoiceNumber: string; companyName: string | null; didCode: string | null
  billingPeriodStart: string; billingPeriodEnd: string; subtotal: number; discount: number; adjustment: number; totalAmount: number
  status: string; invoiceDate: string; dueDate: string | null; paymentReceivedDate: string | null
}
type Balance = { clientId: string; companyName: string; didCode: string | null; totalConfirmed: number; totalInvoiced: number; balanceDue: number }

const STATUS_PILL: Record<string, { bg: string; color: string; border: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', border: '#F59E0B' },
  sent:    { bg: '#DBEAFE', color: '#1D4ED8', border: '#3B82F6' },
  overdue: { bg: '#FEE2E2', color: '#991B1B', border: '#EF4444' },
  paid:    { bg: '#D1FAE5', color: '#065F46', border: '#10B981' },
}
function StatusPill({ status }: { status: string }) {
  const s = STATUS_PILL[status] ?? { bg: '#F3F4F6', color: '#374151', border: '#9CA3AF' }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize border" style={{ background: s.bg, color: s.color, borderColor: s.border }}>{status}</span>
}

const PERIODS = [
  { key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' }, { key: 'custom', label: 'Custom' },
]
const BAR = { background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.teal} 100%)`, border: '1px solid #0A4A58' }
const pillStyle = (active: boolean): React.CSSProperties => active
  ? { background: '#EB9A60', color: '#fff' }
  : { background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }
const darkDate = { background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }

function PeriodPills({ period, setPeriod, from, setFrom, to, setTo }: {
  period: string; setPeriod: (p: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODS.map(p => <button key={p.key} onClick={() => setPeriod(p.key)} className="px-3 py-1 rounded-lg text-xs font-bold transition-all" style={pillStyle(period === p.key)}>{p.label}</button>)}
      </div>
      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <div style={{ width: 140 }}><DateInput value={from} onChange={e => setFrom(e.target.value)} className="rounded-lg px-2.5 py-1 text-xs outline-none" style={darkDate} /></div>
          <span className="text-xs text-white/60 font-bold">→</span>
          <div style={{ width: 140 }}><DateInput value={to} onChange={e => setTo(e.target.value)} className="rounded-lg px-2.5 py-1 text-xs outline-none" style={darkDate} /></div>
        </div>
      )}
    </>
  )
}

const SkeletonCells = ({ n, cls = 'px-3 py-2.5' }: { n: number; cls?: string }) => (
  <>{Array.from({ length: n }).map((_, c) => <td key={c} className={`${cls} border-b border-gray-50`}><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>)}</>
)

function ModalFrame({ header, width, onClose, children }: { header: React.ReactNode; width: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${width} flex flex-col overflow-hidden border border-gray-100`}>
        {header}
        {children}
      </div>
    </div>
  )
}

// ── Revenue table ─────────────────────────────────────────────────────────────
function RevenueTable({ title, rows, loading }: { title: string; rows: RevenueRow[]; loading: boolean }) {
  const total = rows.reduce((t, r) => ({ expected: t.expected + (r.expected ?? 0), confirmed: t.confirmed + (r.confirmed ?? 0), invoice: t.invoice + (r.invoice ?? 0) }), { expected: 0, confirmed: 0, invoice: 0 })
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg, #3D4A5C 0%, #4A5568 100%)', borderBottom: '1px solid #2D3748' }}>
        <span className="text-sm font-black text-white" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em' }}>{title}</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>{loading ? '...' : `${rows.length} rows`}</span>
      </div>
      <div className="grid grid-cols-4 border-b border-gray-100" style={{ background: 'rgba(19,46,87,0.04)' }}>
        {['Name', 'Expected', 'Confirmed', 'Invoiced'].map(h => (
          <div key={h} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: P.navy, opacity: 0.55, fontFamily: "'Aptos', sans-serif" }}>{h}</div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
        {loading ? Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`grid grid-cols-4 px-3 py-2 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
            {[1, 2, 3, 4].map(c => <div key={c} className="h-3 bg-gray-100 rounded animate-pulse w-4/5" />)}
          </div>
        )) : rows.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-400">No data for this period.</div>
        ) : rows.map((row, i) => (
          <div key={i} className={`grid grid-cols-4 hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
            <div className="px-3 py-2 border-b border-gray-50 min-w-0">
              <div className="text-xs font-semibold text-gray-800 truncate" title={row.label}>{row.label}</div>
              {row.sublabel && <div className="text-[10px] font-mono text-gray-400 truncate">{row.sublabel}</div>}
            </div>
            <div className="px-3 py-2 border-b border-gray-50 flex items-center"><span className="text-xs font-bold" style={{ color: P.orange }}>{usd(row.expected)}</span></div>
            <div className="px-3 py-2 border-b border-gray-50 flex items-center"><span className="text-xs font-bold" style={{ color: P.teal }}>{usd(row.confirmed)}</span></div>
            <div className="px-3 py-2 border-b border-gray-50 flex items-center"><span className="text-xs font-bold" style={{ color: P.green }}>{usd(row.invoice)}</span></div>
          </div>
        ))}
      </div>
      {rows.length > 0 && !loading && (
        <div className="grid grid-cols-4 border-t-2 flex-shrink-0" style={{ borderColor: '#3D4A5C', background: 'rgba(19,46,87,0.04)' }}>
          <div className="px-3 py-2 text-xs font-black uppercase tracking-wide" style={{ color: P.navy }}>Total</div>
          {[total.expected, total.confirmed, total.invoice].map((v, ci) => (
            <div key={ci} className="px-3 py-2 flex items-center"><span className="text-xs font-black" style={{ color: [P.orange, P.teal, P.green][ci] }}>{usd(v)}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Revenue Reports ──────────────────────────────────────────────────────
function RevenueTab() {
  const [period, setPeriod] = useState('month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState<Record<'client' | 'agent' | 'vertical', RevenueRow[]>>({ client: [], agent: [], vertical: [] })
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async (silent = false) => {
    if (period === 'custom' && (!fromDate || !toDate)) return
    if (!silent) setLoading(true)
    try {
      const base = { period, fromDate: fromDate || undefined, toDate: toDate || undefined }
      const [c, a, v] = await Promise.all((['client', 'agent', 'vertical'] as const).map(type =>
        apiGet<{ rows: RevenueRow[] }>('/invoicing/revenue-report', { ...base, type })))
      setRows({ client: c.rows ?? [], agent: a.rows ?? [], vertical: v.rows ?? [] })
    } catch {
      if (!silent) setRows({ client: [], agent: [], vertical: [] })
    } finally { if (!silent) setLoading(false) }
  }, [period, fromDate, toDate])

  useEffect(() => { fetchAll() }, [fetchAll])
  useAutoRefresh(() => fetchAll(true))

  return (
    <div className="space-y-4">
      <div className="rounded-xl px-5 py-2.5 shadow-sm flex flex-wrap items-center gap-3" style={BAR}>
        <span className="text-xs font-black text-white uppercase tracking-widest flex-shrink-0" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.1em' }}>Period</span>
        <PeriodPills period={period} setPeriod={setPeriod} from={fromDate} setFrom={setFromDate} to={toDate} setTo={setToDate} />
        {loading && (
          <div className="ml-auto flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-xs text-white/60">Loading</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueTable title="Client-wise Revenue" rows={rows.client} loading={loading} />
        <RevenueTable title="Agent-wise Revenue" rows={rows.agent} loading={loading} />
        <RevenueTable title="Vertical-wise Revenue" rows={rows.vertical} loading={loading} />
      </div>
    </div>
  )
}

// ── Create Invoice modal ──────────────────────────────────────────────────────
function CreateInvoiceModal({ pending, onClose, onCreated }: { pending: Pending; onClose: () => void; onCreated: () => void }) {
  const [discount, setDiscount]     = useState('')
  const [adjustment, setAdjustment] = useState('')
  const [dueDate, setDueDate]       = useState('')
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const subtotal = pending.subtotal ?? 0
  const disc = parseFloat(discount) || 0
  const adj  = parseFloat(adjustment) || 0
  const total = subtotal - disc + adj

  const create = async () => {
    if (!dueDate) { setError('Payment receipt date is required.'); return }
    setSaving(true); setError('')
    try {
      await apiPost('/invoicing/create-invoice', {
        clientId: pending.clientId, periodStart: pending.periodStart, periodEnd: pending.periodEnd,
        discount: disc || null, adjustment: adj || null, paymentReceiptDate: dueDate, notes: notes || null,
      })
      onCreated()
    } catch (err) {
      setError(errMsg(err, 'Failed to create invoice.'))
    } finally { setSaving(false) }
  }

  const inputCls = 'w-full rounded-lg px-2.5 py-1.5 text-xs border border-gray-200 outline-none focus:border-teal-400'
  return (
    <ModalFrame width="max-w-lg" onClose={onClose} header={
      <div className="px-6 py-4 flex items-start justify-between" style={{ background: `linear-gradient(135deg, ${P.tealDk} 0%, ${P.teal} 100%)`, borderBottom: `1px solid ${P.tealDk}` }}>
        <div>
          <h2 className="text-base font-bold text-white" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.05em' }}>Create Invoice</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{pending.companyName} · {pending.periodStart} → {pending.periodEnd}</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    }>
      <div className="px-6 py-5 space-y-4">
        <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(30,132,150,0.06)', border: '1px solid rgba(30,132,150,0.2)' }}>
          <div className="flex justify-between text-xs"><span className="text-gray-500">Sales in period</span><span className="font-bold text-gray-700">{pending.salesCount} records</span></div>
          <div className="flex justify-between text-xs"><span className="text-gray-500">Subtotal</span><span className="font-bold" style={{ color: P.teal }}>{usd(subtotal)}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Discount (USD)</label>
            <input type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Adjustment (USD)</label>
            <input type="number" value={adjustment} onChange={e => setAdjustment(e.target.value)} placeholder="0.00" className={inputCls} />
          </div>
        </div>
        <div className="rounded-xl px-4 py-3 flex justify-between items-center" style={{ background: P.navy }}>
          <span className="text-sm font-bold text-white/70">Total Amount</span>
          <span className="text-lg font-black" style={{ color: P.gold, fontFamily: "'Aptos', sans-serif" }}>{usd(total)}</span>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Receipt Date <span className="text-red-500">*</span></label>
          <DateInput value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes" className={`${inputCls} resize-none`} />
        </div>
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      </div>
      <div className="px-6 pb-5 flex gap-3">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs font-bold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
        <button onClick={create} disabled={saving} className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${P.tealDk}, ${P.teal})` }}>
          {saving ? 'Creating...' : 'Create Invoice'}
        </button>
      </div>
    </ModalFrame>
  )
}

// ── Mark Received modal ───────────────────────────────────────────────────────
function MarkReceivedModal({ invoice, onClose, onSaved }: { invoice: Invoice; onClose: () => void; onSaved: () => void }) {
  const [date, setDate]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const save = async () => {
    if (!date) { setError('Payment received date is required.'); return }
    setSaving(true); setError('')
    try {
      await apiPost(`/invoicing/mark-received/${invoice.id}`, { paymentReceivedDate: date })
      onSaved()
    } catch (err) {
      setError(errMsg(err, 'Failed to update invoice.'))
    } finally { setSaving(false) }
  }

  return (
    <ModalFrame width="max-w-sm" onClose={onClose} header={
      <div className="px-6 py-4" style={{ background: `linear-gradient(135deg, ${P.green} 0%, #4A8A4A 100%)`, borderBottom: '1px solid #2E5A2E' }}>
        <h2 className="text-base font-bold text-white" style={{ fontFamily: "'Aptos', sans-serif" }}>Mark as Received</h2>
        <p className="text-xs mt-0.5 text-white/70">{invoice.invoiceNumber} · {usd(invoice.totalAmount)}</p>
      </div>
    }>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Received Date <span className="text-red-500">*</span></label>
          <DateInput value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-lg px-2.5 py-1.5 text-xs border border-gray-200 outline-none focus:border-green-400" />
        </div>
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      </div>
      <div className="px-6 pb-5 flex gap-3">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs font-bold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50" style={{ background: P.green }}>{saving ? 'Saving...' : 'Confirm'}</button>
      </div>
    </ModalFrame>
  )
}

// ── Tab: Create Invoice (pending billing periods) ─────────────────────────────
function PendingInvoicesTab({ setToast }: { setToast: (t: ToastState) => void }) {
  const [pending, setPending] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)
  const [createModal, setCreateModal] = useState<Pending | null>(null)

  const fetchPending = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try { setPending((await apiGet<{ pending: Pending[] }>('/invoicing/pending-invoices')).pending ?? []) }
    catch { if (!silent) setPending([]) } finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])
  useAutoRefresh(() => fetchPending(true))

  return (
    <div className="space-y-4">
      <div className="rounded-xl px-5 py-2.5 flex items-center justify-between shadow-sm" style={BAR}>
        <span className="text-xs font-black text-white uppercase tracking-widest" style={{ fontFamily: "'Aptos', sans-serif" }}>Create Invoice</span>
        {!loading && (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: pending.length > 0 ? P.gold : 'rgba(255,255,255,0.2)', color: '#fff' }}>{pending.length} pending</span>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 flex items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-teal-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading</span>
        </div>
      ) : pending.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-sm font-semibold text-gray-500">All billing periods are invoiced.</p>
          <p className="text-xs text-gray-400 mt-1">New pending invoices will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pending.map(p => (
            <div key={`${p.clientId}|${p.periodStart}`} className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: 'rgba(215,165,32,0.3)' }}>
              <div className="px-4 py-3 flex items-start justify-between" style={{ background: 'rgba(215,165,32,0.07)', borderBottom: '1px solid rgba(215,165,32,0.2)' }}>
                <div className="min-w-0">
                  <p className="font-black text-sm truncate" style={{ color: P.navy, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.03em' }}>{p.companyName}</p>
                  <p className="text-xs font-mono text-gray-400">{p.didCode}</p>
                </div>
                <span className="ml-2 flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: P.teal, color: '#fff' }}>{p.salesCount} sales</span>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs"><span className="text-gray-400">Billing Period</span><span className="font-semibold text-gray-700">{p.periodStart} → {p.periodEnd}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-400">Cycle</span><span className="font-semibold text-gray-600">{p.cycleDays} days</span></div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-100">
                  <span className="text-gray-400 font-semibold">Subtotal</span>
                  <span className="text-base font-black" style={{ color: P.navy, fontFamily: "'Aptos', sans-serif" }}>{usd(p.subtotal)}</span>
                </div>
              </div>
              <div className="px-4 pb-4">
                <button onClick={() => setCreateModal(p)} className="w-full py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90" style={{ background: `linear-gradient(135deg, ${P.tealDk}, ${P.teal})` }}>Create Invoice</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createModal && (
        <CreateInvoiceModal pending={createModal} onClose={() => setCreateModal(null)}
          onCreated={() => { setCreateModal(null); setToast({ message: 'Invoice created successfully.', type: 'success' }); fetchPending() }} />
      )}
    </div>
  )
}

// ── Tab: Invoices ─────────────────────────────────────────────────────────────
const STATUS_FILTERS = ['pending', 'sent', 'overdue', 'paid', 'all']

function InvoicesTab({ setToast }: { setToast: (t: ToastState) => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [period, setPeriod]     = useState('today')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')
  const [receivedModal, setReceivedModal] = useState<Invoice | null>(null)

  const fetchInvoices = useCallback(async (silent = false) => {
    if (period === 'custom' && (!fromDate || !toDate)) return
    if (!silent) setLoading(true)
    try {
      const r = await apiGet<{ invoices: Invoice[] }>('/invoicing/invoices', { status: statusFilter, period, fromDate: fromDate || undefined, toDate: toDate || undefined })
      setInvoices(r.invoices ?? [])
    } catch { if (!silent) setInvoices([]) } finally { if (!silent) setLoading(false) }
  }, [statusFilter, period, fromDate, toDate])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useAutoRefresh(() => fetchInvoices(true))

  const markSent = async (inv: Invoice) => {
    try {
      await apiPost(`/invoicing/mark-sent/${inv.id}`)
      setToast({ message: `${inv.invoiceNumber} marked as sent.`, type: 'success' })
      fetchInvoices()
    } catch (err) {
      setToast({ message: errMsg(err, 'Failed.'), type: 'error' })
    }
  }

  const cols = ['Invoice #', 'Client', 'Billing Period', 'Subtotal', 'Discount', 'Other Adjustment', 'Total', 'Status', 'Due Date', 'Actions']
  return (
    <div className="space-y-4">
      <div className="rounded-xl px-5 py-2.5 shadow-sm flex flex-wrap items-center gap-3" style={BAR}>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map(s => <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all" style={pillStyle(statusFilter === s)}>{s === 'all' ? 'All' : s}</button>)}
        </div>
        <div className="w-px h-5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.25)' }} />
        <PeriodPills period={period} setPeriod={setPeriod} from={fromDate} setFrom={setFromDate} to={toDate} setTo={setToDate} />
        <span className="ml-auto text-xs font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 820 }}>
            <thead>
              <tr style={{ background: '#F2AC18' }}>
                {cols.map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-bold uppercase whitespace-nowrap" style={{ color: '#1a1a1a', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}><SkeletonCells n={cols.length} /></tr>)
              : invoices.length === 0 ? <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-sm text-gray-400">No invoices found.</td></tr>
              : invoices.map((inv, i) => (
                <tr key={inv.id} className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-3 py-2.5 border-b border-gray-50"><span className="font-mono text-xs font-bold" style={{ color: P.navy }}>{inv.invoiceNumber}</span></td>
                  <td className="px-3 py-2.5 border-b border-gray-50"><div className="text-xs font-semibold text-gray-800">{inv.companyName}</div></td>
                  <td className="px-3 py-2.5 border-b border-gray-50"><span className="text-xs text-gray-600 whitespace-nowrap">{inv.billingPeriodStart} → {inv.billingPeriodEnd}</span></td>
                  <td className="px-3 py-2.5 border-b border-gray-50"><span className="text-xs font-semibold text-gray-700">{usd(inv.subtotal)}</span></td>
                  <td className="px-3 py-2.5 border-b border-gray-50"><span className="text-xs text-gray-500">{usd(inv.discount)}</span></td>
                  <td className="px-3 py-2.5 border-b border-gray-50"><span className="text-xs text-gray-500">{usd(inv.adjustment)}</span></td>
                  <td className="px-3 py-2.5 border-b border-gray-50"><span className="text-xs font-black" style={{ color: P.navy }}>{usd(inv.totalAmount)}</span></td>
                  <td className="px-3 py-2.5 border-b border-gray-50"><StatusPill status={inv.status} /></td>
                  <td className="px-3 py-2.5 border-b border-gray-50">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{(inv.status === 'paid' ? inv.paymentReceivedDate : inv.dueDate) ?? ''}</span>
                  </td>
                  <td className="px-3 py-2.5 border-b border-gray-50">
                    {inv.status === 'pending' && <button onClick={() => markSent(inv)} className="px-2.5 py-1 rounded-lg text-xs font-bold text-white whitespace-nowrap" style={{ background: P.teal }}>Mark Sent</button>}
                    {(inv.status === 'sent' || inv.status === 'overdue') && <button onClick={() => setReceivedModal(inv)} className="px-2.5 py-1 rounded-lg text-xs font-bold text-white whitespace-nowrap" style={{ background: P.green }}>Mark Received</button>}
                    {inv.status === 'paid' && <span className="text-xs text-gray-300">Paid</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {receivedModal && (
        <MarkReceivedModal invoice={receivedModal} onClose={() => setReceivedModal(null)}
          onSaved={() => { setReceivedModal(null); setToast({ message: 'Payment marked as received.', type: 'success' }); fetchInvoices() }} />
      )}
    </div>
  )
}

// ── Tab: Customer Balances ────────────────────────────────────────────────────
function BalancesTab() {
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading]   = useState(true)

  const fetchBalances = useCallback((silent = false) =>
    apiGet<{ balances: Balance[] }>('/invoicing/customer-balances')
      .then(r => setBalances(r.balances ?? []))
      .catch(() => { if (!silent) setBalances([]) })
      .finally(() => setLoading(false)), [])

  useEffect(() => { fetchBalances() }, [fetchBalances])
  useAutoRefresh(() => fetchBalances(true))

  const totals = balances.reduce((a, b) => ({
    totalConfirmed: a.totalConfirmed + b.totalConfirmed, totalInvoiced: a.totalInvoiced + b.totalInvoiced, balanceDue: a.balanceDue + b.balanceDue,
  }), { totalConfirmed: 0, totalInvoiced: 0, balanceDue: 0 })

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${P.navy} 0%, ${P.teal} 100%)` }}>
        <span className="text-sm font-black text-white" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em' }}>Client Balance Tracker</span>
        <span className="text-xs italic" style={{ color: 'rgba(255,255,255,0.6)' }}>All-time · not affected by period filters</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 560 }}>
          <thead>
            <tr style={{ background: '#F2AC18' }}>
              {['Client', 'DID Code', 'Total Confirmed', 'Already Invoiced', 'Balance Due'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-bold uppercase" style={{ color: '#1a1a1a', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 4 }).map((_, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}><SkeletonCells n={5} cls="px-4 py-2.5" /></tr>)
            : balances.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">No balance data. Final-approved sales will appear here.</td></tr>
            : balances.map((b, i) => (
              <tr key={b.clientId} className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                <td className="px-4 py-2.5 border-b border-gray-50"><span className="font-semibold text-gray-800">{b.companyName}</span></td>
                <td className="px-4 py-2.5 border-b border-gray-50"><span className="font-mono text-xs text-gray-500">{b.didCode}</span></td>
                <td className="px-4 py-2.5 border-b border-gray-50"><span className="text-xs font-bold" style={{ color: P.teal }}>{usd(b.totalConfirmed)}</span></td>
                <td className="px-4 py-2.5 border-b border-gray-50"><span className="text-xs font-bold" style={{ color: P.orange }}>{usd(b.totalInvoiced)}</span></td>
                <td className="px-4 py-2.5 border-b border-gray-50"><span className="text-sm font-black" style={{ color: b.balanceDue > 0 ? P.navy : P.green }}>{usd(b.balanceDue)}</span></td>
              </tr>
            ))}
          </tbody>
          {balances.length > 0 && !loading && (
            <tfoot>
              <tr style={{ background: 'rgba(19,46,87,0.06)' }}>
                <td colSpan={2} className="px-4 py-2 text-xs font-black uppercase tracking-wide border-t-2 border-gray-200" style={{ color: P.navy }}>Total</td>
                {(['totalConfirmed', 'totalInvoiced', 'balanceDue'] as const).map((col, ci) => (
                  <td key={col} className="px-4 py-2 border-t-2 border-gray-200"><span className="text-xs font-black" style={{ color: [P.teal, P.orange, P.navy][ci] }}>{usd(totals[col])}</span></td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = ['Revenue Reports', 'Invoices', 'Customer Balances', 'Create Invoice']

export default function InvoicingPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [toast, setToast] = useState<ToastState>(null)

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="px-5 pb-5 space-y-4 min-h-screen" style={{ background: P.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 52 }}>
          <PageTitle>Invoicing &amp; Payments</PageTitle>
        </div>
        <div className="flex flex-wrap gap-1 p-1 rounded-xl" style={{ background: '#fff', border: '1px solid #E5E7EB', width: 'fit-content' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setActiveTab(i)} className="px-4 py-1.5 rounded-lg text-sm font-bold transition-all"
              style={activeTab === i
                ? { background: `linear-gradient(135deg, ${P.navy}, ${P.teal})`, color: '#fff', fontFamily: "'Aptos', sans-serif", letterSpacing: '0.03em' }
                : { color: P.gray, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.03em' }}>
              {t}
            </button>
          ))}
        </div>
        {activeTab === 0 && <RevenueTab />}
        {activeTab === 1 && <InvoicesTab setToast={setToast} />}
        {activeTab === 2 && <BalancesTab />}
        {activeTab === 3 && <PendingInvoicesTab setToast={setToast} />}
      </div>
    </>
  )
}
