'use client'

// The Laravel Revenue Report, kept beside Billing & Payments: per client, agent and vertical,
// what is expected (manager approved, at the client's fixed rate), confirmed (final approved, at
// the frozen sale rate) and invoiced (on issued invoices). US dollars.

import { useState, useEffect, useCallback } from 'react'
import { apiGet } from '@/lib/api'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import PillSelect from '@/components/ui/PillSelect'
import { PageShell, PageHeader, FilterBar, FilterSep, FilterDate } from '@/components/ui/PageChrome'
import { usd } from '@/lib/format'
import { P } from '@/lib/palette'

type RevenueRow = { label: string; sublabel: string; expected: number; confirmed: number; invoice: number }

const PERIODS = [
  { value: 'today', label: 'Today' }, { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' }, { value: 'custom', label: 'Custom' },
]
const ORANGE = '#C25A1F', GREEN = '#3A6B3A'
const F = "'Aptos', sans-serif"

function RevenueTable({ title, rows, loading }: { title: string; rows: RevenueRow[]; loading: boolean }) {
  const total = rows.reduce((t, r) => ({ expected: t.expected + (r.expected ?? 0), confirmed: t.confirmed + (r.confirmed ?? 0), invoice: t.invoice + (r.invoice ?? 0) }), { expected: 0, confirmed: 0, invoice: 0 })
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg, #3D4A5C 0%, #4A5568 100%)', borderBottom: '1px solid #2D3748' }}>
        <span className="text-sm font-black text-white" style={{ fontFamily: F, letterSpacing: '0.06em' }}>{title}</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>{loading ? '...' : `${rows.length} rows`}</span>
      </div>
      <div className="grid grid-cols-4 border-b border-gray-100" style={{ background: 'rgba(19,46,87,0.04)' }}>
        {['Name', 'Expected', 'Confirmed', 'Invoiced'].map(h => (
          <div key={h} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: P.navy, opacity: 0.55, fontFamily: F }}>{h}</div>
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
            <div className="px-3 py-2 border-b border-gray-50 flex items-center"><span className="text-xs font-bold" style={{ color: ORANGE }}>{usd(row.expected)}</span></div>
            <div className="px-3 py-2 border-b border-gray-50 flex items-center"><span className="text-xs font-bold" style={{ color: P.teal }}>{usd(row.confirmed)}</span></div>
            <div className="px-3 py-2 border-b border-gray-50 flex items-center"><span className="text-xs font-bold" style={{ color: GREEN }}>{usd(row.invoice)}</span></div>
          </div>
        ))}
      </div>
      {rows.length > 0 && !loading && (
        <div className="grid grid-cols-4 border-t-2 flex-shrink-0" style={{ borderColor: '#3D4A5C', background: 'rgba(19,46,87,0.04)' }}>
          <div className="px-3 py-2 text-xs font-black uppercase tracking-wide" style={{ color: P.navy }}>Total</div>
          {[total.expected, total.confirmed, total.invoice].map((v, ci) => (
            <div key={ci} className="px-3 py-2 flex items-center"><span className="text-xs font-black" style={{ color: [ORANGE, P.teal, GREEN][ci] }}>{usd(v)}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RevenueReportPage() {
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
  useAutoRefresh(() => fetchAll(true), { sales: true })

  return (
    <PageShell>
      <PageHeader title="Revenue Report" />
      <FilterBar>
        <PillSelect value={period} onChange={setPeriod} dimValue="month" minWidth={140} options={PERIODS} />
        {period === 'custom' && (
          <>
            <FilterSep />
            <FilterDate value={fromDate} onChange={setFromDate} title="From" />
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 700 }}>to</span>
            <FilterDate value={toDate} onChange={setToDate} title="To" />
          </>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.9)', fontWeight: 600, padding: '0 6px' }}>
          Expected: manager approved · Confirmed: final approved · Invoiced: on issued invoices
        </span>
      </FilterBar>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ marginTop: 8 }}>
        <RevenueTable title="Client-wise Revenue" rows={rows.client} loading={loading} />
        <RevenueTable title="Agent-wise Revenue" rows={rows.agent} loading={loading} />
        <RevenueTable title="Vertical-wise Revenue" rows={rows.vertical} loading={loading} />
      </div>
    </PageShell>
  )
}
