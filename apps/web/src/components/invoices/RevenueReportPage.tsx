'use client'

// The Laravel Revenue Report, kept beside Billing & Payments: per client, agent or vertical (picked
// in the filter bar), what is expected (manager approved, at the client's fixed rate), confirmed
// (final approved, at the frozen sale rate) and invoiced (sales on issued invoices). US dollars.

import { useState, useEffect, useCallback } from 'react'
import { apiGet } from '@/lib/api'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import PillSelect from '@/components/ui/PillSelect'
import DataTable from '@/components/ui/DataTable'
import { PageShell, PageHeader, FilterBar, FilterSep, FilterPills, FilterDate, FilterCount } from '@/components/ui/PageChrome'
import { usd } from '@/lib/format'
import { P } from '@/lib/palette'

type RevenueRow = { label: string; sublabel: string; expected: number; confirmed: number; invoice: number }
type GroupBy = 'client' | 'agent' | 'vertical'

const GROUPS = [['client', 'Client wise'], ['agent', 'Agent wise'], ['vertical', 'Vertical wise']] as const
const NAME_LABEL: Record<GroupBy, string> = { client: 'Client', agent: 'Agent', vertical: 'Vertical' }
const PERIODS = [
  { value: 'today', label: 'Today' }, { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' }, { value: 'custom', label: 'Custom' },
]
const ORANGE = '#C25A1F', GREEN = '#3A6B3A'
const F = "'Aptos', sans-serif"

export default function RevenueReportPage() {
  const [group, setGroup]     = useState<GroupBy>('client')
  const [period, setPeriod]   = useState('month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]   = useState('')
  const [rows, setRows]       = useState<RevenueRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchRows = useCallback(async (silent = false) => {
    if (period === 'custom' && (!fromDate || !toDate)) return
    if (!silent) setLoading(true)
    try {
      const r = await apiGet<{ rows: RevenueRow[] }>('/invoicing/revenue-report', { type: group, period, fromDate: fromDate || undefined, toDate: toDate || undefined })
      setRows(r.rows ?? [])
    } catch {
      if (!silent) setRows([])
    } finally { if (!silent) setLoading(false) }
  }, [group, period, fromDate, toDate])

  useEffect(() => { fetchRows() }, [fetchRows])
  useAutoRefresh(() => fetchRows(true), { sales: true })

  const total = rows.reduce((t, r) => ({ expected: t.expected + (r.expected ?? 0), confirmed: t.confirmed + (r.confirmed ?? 0), invoice: t.invoice + (r.invoice ?? 0) }), { expected: 0, confirmed: 0, invoice: 0 })
  const foot: React.CSSProperties = { padding: '9px 12px', fontSize: 13, fontWeight: 900, fontFamily: F, background: '#FEF6E0', borderTop: '2px solid #F2AC18', whiteSpace: 'nowrap' }

  return (
    <PageShell>
      <PageHeader title="Revenue Report" />
      <FilterBar>
        <FilterPills value={group} onChange={v => setGroup(v as GroupBy)} options={GROUPS} />
        <FilterSep />
        <PillSelect value={period} onChange={setPeriod} dimValue="month" minWidth={140} options={PERIODS} />
        {period === 'custom' && (
          <>
            <FilterDate value={fromDate} onChange={setFromDate} title="From" />
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 700 }}>to</span>
            <FilterDate value={toDate} onChange={setToDate} title="To" />
          </>
        )}
        {!loading && <FilterCount>{rows.length} {rows.length === 1 ? 'row' : 'rows'}</FilterCount>}
      </FilterBar>

      <DataTable
        id="revenueReport" minWidth={760} rows={rows} loading={loading}
        rowKey={(r: RevenueRow, i: number) => `${r.label}|${r.sublabel}|${i}`}
        emptyText="No sales in this period."
        columns={[
          { key: 'n', label: '#', width: 50, align: 'right', resizable: false, cellStyle: { color: P.textMuted }, render: (_r: RevenueRow, i: number) => i + 1 },
          { key: 'label', label: NAME_LABEL[group], width: 280, render: (r: RevenueRow) => (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: P.navy, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
              {r.sublabel && <span style={{ fontSize: 11.5, color: P.textMuted }}>{r.sublabel}</span>}
            </span>
          ) },
          { key: 'expected', label: 'Expected', width: 150, align: 'right', render: (r: RevenueRow) => <span style={{ fontWeight: 700, color: ORANGE }}>{usd(r.expected)}</span> },
          { key: 'confirmed', label: 'Confirmed', width: 150, align: 'right', render: (r: RevenueRow) => <span style={{ fontWeight: 700, color: P.teal }}>{usd(r.confirmed)}</span> },
          { key: 'invoice', label: 'Invoiced', width: 150, align: 'right', render: (r: RevenueRow) => <span style={{ fontWeight: 700, color: GREEN }}>{usd(r.invoice)}</span> },
        ]}
        footer={!loading && rows.length > 0 ? (
          <tfoot>
            <tr>
              <td style={foot} />
              <td style={{ ...foot, color: P.navy, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</td>
              <td style={{ ...foot, textAlign: 'right', color: ORANGE }}>{usd(total.expected)}</td>
              <td style={{ ...foot, textAlign: 'right', color: P.teal }}>{usd(total.confirmed)}</td>
              <td style={{ ...foot, textAlign: 'right', color: GREEN }}>{usd(total.invoice)}</td>
            </tr>
          </tfoot>
        ) : null}
      />
      <p style={{ margin: '8px 2px 0', fontSize: 11.5, color: P.textMuted, fontFamily: F }}>
        Expected: manager approved sales at the client&apos;s fixed rate. Confirmed: final approved sales at their rate. Invoiced: sales on issued invoices.
      </p>
    </PageShell>
  )
}
