// @ts-nocheck
'use client'

// Reports: Profit & Loss, Balance Sheet, AR Ageing, Cash Flow and Budget vs Actual.

import { useState, useEffect, useCallback } from 'react'
import api from './accApi'
import DateInput from '@/components/ui/DateInput'
import { P, today, yearStart, pkr, fmt, makePDF, makeXLSX, ExportBtn, MONTHS, SectionHeader, Btn, FilterBar, FilterPill, Modal, EmptyState, Th, Td, THEAD_STYLE } from './shared'
import { useAccounts } from './TransactionsTab'
// ══════════════════════════════════════════════════════════════════════════════
// MODULE 6: REPORTS
// ══════════════════════════════════════════════════════════════════════════════

function PnLReport() {
  const [from, setFrom] = useState(yearStart())
  const [to, setTo]     = useState(today())
  const [cmpFrom, setCmpFrom] = useState('')
  const [cmpTo, setCmpTo]     = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/pnl', { params: { from, to, cmp_from: cmpFrom, cmp_to: cmpTo } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [from, to, cmpFrom, cmpTo])

  useEffect(() => { fetch() }, [fetch])

  const cur = data?.current
  const cmp = data?.compare

  const Section = ({ title, items, normalBalance, cmpItems }) => {
    const total = items?.reduce((s, r) => s + (r.normal_balance === normalBalance
      ? (normalBalance === 'credit' ? r.total_credit - r.total_debit : r.total_debit - r.total_credit) : 0), 0) ?? 0
    return (
      <div className="mb-4">
        <div className="px-4 py-3" style={{ background: P.tealDk + '18' }}>
          <span className="text-xs font-black" style={{ color: P.tealDk, fontFamily: "'Aptos', sans-serif" }}>{title}</span>
        </div>
        {(items ?? []).map((r, i) => {
          const val = r.normal_balance === 'credit'
            ? (r.total_credit - r.total_debit)
            : r.total_debit - r.total_credit
          const cmpRow = cmpItems?.find(x => x.id === r.id)
          const cmpVal = cmpRow
            ? (r.normal_balance === 'credit' ? cmpRow.total_credit - cmpRow.total_debit : cmpRow.total_debit - cmpRow.total_credit)
            : null
          return (
            <div key={r.id} className={`flex items-center px-6 py-1.5 border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} style={{ borderColor: P.border + '60' }}>
              <span className="flex-1 text-xs" style={{ color: P.text }}>{r.account_name}</span>
              <span className="text-xs font-bold w-32 text-right" style={{ color: P.navyGr }}>{fmt(val)}</span>
              {cmp && <span className="text-xs w-32 text-right" style={{ color: P.muted }}>{cmpVal !== null ? fmt(cmpVal) : ''}</span>}
            </div>
          )
        })}
        <div className="flex items-center px-6 py-3" style={{ background: P.gold + '18' }}>
          <span className="flex-1 text-xs font-black" style={{ color: P.navyGr }}>Total {title}</span>
          <span className="text-xs font-black w-32 text-right" style={{ color: P.navyGr }}>{fmt(total)}</span>
          {cmp && <span className="text-xs w-32 text-right" style={{ color: P.muted }}></span>}
        </div>
      </div>
    )
  }

  const doExportPDF = () => {
    if (!cur) return
    const hasCmp = !!cmp
    const cols = [
      { label: 'Account',  width: hasCmp ? 95 : 130 },
      { label: `${cur.from} → ${cur.to}`, width: 38, right: true },
      ...(hasCmp ? [{ label: `${cmp.from} → ${cmp.to}`, width: 38, right: true }] : []),
    ]
    const valOf = (r) => r.normal_balance === 'credit' ? r.total_credit - r.total_debit : r.total_debit - r.total_credit
    const cmpValOf = (r, cmpArr) => { const x = cmpArr?.find(c => c.id === r.id); return x ? valOf(x) : null }
    const body = []
    // Revenue
    body.push(['▌ REVENUE', '', ...(hasCmp ? [''] : [])])
    for (const r of cur.revenue ?? []) {
      const cv = cmpValOf(r, cmp?.revenue)
      body.push([r.account_name, fmt(valOf(r)), ...(hasCmp ? [cv !== null ? fmt(cv) : ''] : [])])
    }
    const totRev = (cur.revenue ?? []).reduce((s, r) => s + valOf(r), 0)
    body.push(['Total Revenue', fmt(totRev), ...(hasCmp ? [''] : [])])
    body.push(['', '', ...(hasCmp ? [''] : [])])
    // Expenses
    body.push(['▌ EXPENSES', '', ...(hasCmp ? [''] : [])])
    for (const r of cur.expenses ?? []) {
      const cv = cmpValOf(r, cmp?.expenses)
      body.push([r.account_name, fmt(valOf(r)), ...(hasCmp ? [cv !== null ? fmt(cv) : ''] : [])])
    }
    const totExp = (cur.expenses ?? []).reduce((s, r) => s + valOf(r), 0)
    body.push(['Total Expenses', fmt(totExp), ...(hasCmp ? [''] : [])])
    const footerRow = [
      'NET PROFIT / (LOSS)',
      fmt(cur.net_profit),
      ...(hasCmp ? [fmt(cmp.net_profit)] : []),
    ]
    makePDF({ title: 'Profit & Loss Statement', subtitle: `Period: ${from} → ${to}`, cols, body, footerRow, orientation: 'portrait' })
  }

  const doExportXLSX = () => {
    if (!cur) return
    const hasCmp = !!cmp
    const valOf = (r) => r.normal_balance === 'credit' ? r.total_credit - r.total_debit : r.total_debit - r.total_credit
    const rows = []
    rows.push(['REVENUE', '', ...(hasCmp ? [''] : [])])
    for (const r of cur.revenue ?? []) {
      const x = cmp?.revenue?.find(c => c.id === r.id)
      rows.push([r.account_name, valOf(r), ...(hasCmp ? [x ? valOf(x) : ''] : [])])
    }
    rows.push(['Total Revenue', (cur.revenue ?? []).reduce((s, r) => s + valOf(r), 0), ...(hasCmp ? [''] : [])])
    rows.push(['', '', ...(hasCmp ? [''] : [])])
    rows.push(['EXPENSES', '', ...(hasCmp ? [''] : [])])
    for (const r of cur.expenses ?? []) {
      const x = cmp?.expenses?.find(c => c.id === r.id)
      rows.push([r.account_name, valOf(r), ...(hasCmp ? [x ? valOf(x) : ''] : [])])
    }
    rows.push(['Total Expenses', (cur.expenses ?? []).reduce((s, r) => s + valOf(r), 0), ...(hasCmp ? [''] : [])])
    rows.push(['', '', ...(hasCmp ? [''] : [])])
    rows.push(['NET PROFIT / (LOSS)', cur.net_profit, ...(hasCmp ? [cmp.net_profit] : [])])
    makeXLSX({
      filename: `PnL_${from}_to_${to}.xlsx`,
      sheetName: 'P&L',
      title: 'Profit & Loss Statement',
      subtitle: `Period: ${from} → ${to}`,
      headers: ['Account', `${from} → ${to}`, ...(hasCmp ? [`${cmpFrom} → ${cmpTo}`] : [])],
      rows,
      colWidths: [40, 18, ...(hasCmp ? [18] : [])],
    })
  }

  return (
    <div>
      <SectionHeader title="Profit & Loss Statement"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!cur} />} />
      <FilterBar>
        <span className="text-white text-xs font-bold">Period:</span>
        <DateInput value={from} onChange={e => setFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/60 text-xs">→</span>
        <DateInput value={to} onChange={e => setTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/50 text-xs">|</span>
        <span className="text-white text-xs font-bold">Compare:</span>
        <DateInput value={cmpFrom} onChange={e => setCmpFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/60 text-xs">→</span>
        <DateInput value={cmpTo} onChange={e => setCmpTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        {/* Header */}
        <div className="px-6 py-3 flex items-center" style={{ background: P.navyGr }}>
          <span className="flex-1 font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif" }}>ACCOUNT</span>
          <span className="font-black text-white text-xs w-32 text-right">{cur?.from} → {cur?.to}</span>
          {cmp && <span className="font-black text-white text-xs w-32 text-right" style={{ opacity: 0.7 }}>{cmp.from} → {cmp.to}</span>}
        </div>

        {loading ? <EmptyState msg="Loading…" /> : cur && (
          <>
            <Section title="Revenue" items={cur.revenue} normalBalance="credit" cmpItems={cmp?.revenue} />
            <Section title="Expenses" items={cur.expenses} normalBalance="debit" cmpItems={cmp?.expenses} />

            {/* Net Profit */}
            <div className="px-6 py-3 flex items-center" style={{ background: P.navyGr }}>
              <span className="flex-1 font-black text-white text-sm" style={{ fontFamily: "'Aptos', sans-serif" }}>NET PROFIT / (LOSS)</span>
              <span className={`font-black text-sm w-32 text-right ${cur.net_profit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {pkr(cur.net_profit)}
              </span>
              {cmp && <span className={`font-black text-sm w-32 text-right ${cmp.net_profit >= 0 ? 'text-green-300' : 'text-red-300'} opacity-70`}>
                {pkr(cmp.net_profit)}
              </span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BalanceSheetReport() {
  const [asOf, setAsOf] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/balance-sheet', { params: { as_of: asOf } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [asOf])

  useEffect(() => { fetch() }, [fetch])

  const Section = ({ title, items, color }) => {
    const grouped = {}
    for (const r of (items ?? [])) {
      if (!grouped[r.level_2]) grouped[r.level_2] = []
      grouped[r.level_2].push(r)
    }
    return (
      <div className="mb-4">
        <div className="px-4 py-3" style={{ background: color }}>
          <span className="font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif" }}>{title}</span>
        </div>
        {Object.entries(grouped).map(([l2, rows]) => (
          <div key={l2}>
            <div className="px-6 py-2.5" style={{ background: color + '18' }}>
              <span className="text-xs font-bold" style={{ color }}>{l2}</span>
            </div>
            {rows.map((r, i) => (
              <div key={r.id} className={`flex items-center px-8 py-1.5 border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} style={{ borderColor: P.border + '60' }}>
                <span className="text-xs flex-1" style={{ color: P.text }}>{r.account_name}</span>
                {r.level_4 && <span className="text-xs mr-3 px-2 py-0.5 rounded" style={{ background: P.gold + '20', color: P.gold }}>{r.level_4}</span>}
                <span className="text-xs font-bold w-32 text-right" style={{ color: r.balance >= 0 ? P.navyGr : P.red }}>
                  {r.balance < 0 ? '(' : ''}{fmt(Math.abs(r.balance))}{r.balance < 0 ? ')' : ''}
                </span>
              </div>
            ))}
            <div className="flex items-center px-6 py-2.5 border-b" style={{ background: P.border + '30', borderColor: P.border }}>
              <span className="flex-1 text-xs font-black" style={{ color }}>Total {l2}</span>
              <span className="font-black text-xs w-32 text-right" style={{ color }}>
                {fmt(rows.reduce((s, r) => s + r.balance, 0))}
              </span>
            </div>
          </div>
        ))}
        <div className="flex items-center px-4 py-3" style={{ background: P.gold + '18' }}>
          <span className="flex-1 text-xs font-black" style={{ color: P.navyGr }}>TOTAL {title.toUpperCase()}</span>
          <span className="font-black text-sm w-32 text-right" style={{ color: P.navyGr }}>
            {fmt((items ?? []).reduce((s, r) => s + r.balance, 0))}
          </span>
        </div>
      </div>
    )
  }

  const doExportPDF = () => {
    if (!data) return
    const cols = [
      { label: 'Account',          width: 120 },
      { label: 'Asset Class (L4)', width: 30 },
      { label: 'Balance (PKR)',    width: 38, right: true },
    ]
    const body = []
    const addSection = (title, items) => {
      if (!items?.length) return
      body.push([title, '', ''])
      const grouped = {}
      for (const r of items) { if (!grouped[r.level_2]) grouped[r.level_2] = []; grouped[r.level_2].push(r) }
      for (const [l2, rows] of Object.entries(grouped)) {
        body.push([`  ${l2}`, '', ''])
        for (const r of rows) {
          body.push([`    ${r.account_name}`, r.level_4 ?? '', fmt(r.balance)])
        }
        body.push([`  Total ${l2}`, '', fmt(rows.reduce((s, r) => s + r.balance, 0))])
      }
      body.push([`TOTAL ${title.toUpperCase()}`, '', fmt((items ?? []).reduce((s, r) => s + r.balance, 0))])
      body.push(['', '', ''])
    }
    addSection('Assets', data.assets)
    addSection('Liabilities', data.liabilities)
    addSection('Equity', data.equity)
    const footerRow = ['TOTAL LIABILITIES & EQUITY', '', fmt(data.total_liabilities + data.total_equity)]
    makePDF({ title: 'Balance Sheet', subtitle: `As Of: ${asOf}`, cols, body, footerRow, orientation: 'portrait' })
  }

  const doExportXLSX = () => {
    if (!data) return
    const rows = []
    const addSection = (title, items) => {
      if (!items?.length) return
      rows.push([title, '', ''])
      const grouped = {}
      for (const r of items) { if (!grouped[r.level_2]) grouped[r.level_2] = []; grouped[r.level_2].push(r) }
      for (const [l2, rr] of Object.entries(grouped)) {
        rows.push([`  ${l2}`, '', ''])
        for (const r of rr) rows.push([`    ${r.account_name}`, r.level_4 ?? '', r.balance])
        rows.push([`  Total ${l2}`, '', rr.reduce((s, r) => s + r.balance, 0)])
      }
      rows.push([`TOTAL ${title.toUpperCase()}`, '', (items ?? []).reduce((s, r) => s + r.balance, 0)])
      rows.push(['', '', ''])
    }
    addSection('Assets', data.assets)
    addSection('Liabilities', data.liabilities)
    addSection('Equity', data.equity)
    rows.push(['TOTAL LIABILITIES & EQUITY', '', data.total_liabilities + data.total_equity])
    makeXLSX({
      filename: `Balance_Sheet_${asOf}.xlsx`,
      sheetName: 'Balance Sheet',
      title: 'Balance Sheet',
      subtitle: `As Of: ${asOf}`,
      headers: ['Account', 'Asset Class (L4)', 'Balance (PKR)'],
      rows,
      colWidths: [50, 22, 18],
    })
  }

  return (
    <div>
      <SectionHeader title="Balance Sheet"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!data} />} />
      <FilterBar>
        <span className="text-white text-xs font-bold">As Of:</span>
        <DateInput value={asOf} onChange={e => setAsOf(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        {data && (
          <span className={`text-xs font-bold ml-2 px-3 py-1 rounded-lg ${data.balanced ? 'text-green-200' : 'text-red-300'}`}>
            {data.balanced ? '✓ Balanced' : '✕ Not Balanced'}
          </span>
        )}
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        {loading ? <EmptyState msg="Loading…" /> : data && (
          <>
            <Section title="Assets" items={data.assets} color={P.tealGr} />
            <Section title="Liabilities" items={data.liabilities} color={P.red} />
            <Section title="Equity" items={data.equity} color={P.navyGr} />
            <div className="flex items-center px-4 py-3" style={{ background: P.navyGr }}>
              <span className="flex-1 font-black text-white" style={{ fontFamily: "'Aptos', sans-serif" }}>TOTAL LIABILITIES & EQUITY</span>
              <span className="font-black text-white text-sm">{pkr(data.total_liabilities + data.total_equity)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ARAgeing() {
  const [asOf, setAsOf] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/ar-ageing', { params: { as_of: asOf } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [asOf])

  useEffect(() => { fetch() }, [fetch])

  const rows   = data?.rows ?? []
  const buckets = ['current', '1-30', '31-60', '61-90', '91+']

  const doExportPDF = () => {
    const cols = [
      { label: 'Invoice #',   width: 25, bold: true },
      { label: 'Customer',    width: 50 },
      { label: 'Date',        width: 20 },
      { label: 'Total',       width: 28, right: true },
      { label: 'Outstanding', width: 28, right: true },
      { label: 'Bucket',      width: 20 },
      { label: 'Days Overdue', width: 22, right: true },
    ]
    const body = rows.map(r => [
      r.voucher_number, r.party ?? '', r.date,
      fmt(r.total), fmt(r.outstanding), r.bucket, String(r.days_overdue),
    ])
    const footerRow = ['', 'TOTAL', '', '', fmt(rows.reduce((s, r) => s + r.outstanding, 0)), '', '']
    makePDF({ title: 'Accounts Receivable Ageing', subtitle: `As Of: ${asOf}`, cols, body, footerRow, orientation: 'landscape' })
  }

  const doExportXLSX = () => {
    makeXLSX({
      filename: `AR_Ageing_${asOf}.xlsx`,
      sheetName: 'AR Ageing',
      title: 'Accounts Receivable Ageing',
      subtitle: `As Of: ${asOf}`,
      headers: ['Invoice #', 'Customer', 'Date', 'Total', 'Outstanding', 'Bucket', 'Days Overdue'],
      rows: rows.map(r => [r.voucher_number, r.party ?? '', r.date, r.total, r.outstanding, r.bucket, r.days_overdue]),
      footerRow: ['', 'TOTAL', '', '', rows.reduce((s, r) => s + r.outstanding, 0), '', ''],
      colWidths: [16, 30, 12, 16, 16, 12, 12],
    })
  }

  return (
    <div>
      <SectionHeader title="Accounts Receivable Ageing"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!rows.length} />} />
      <FilterBar>
        <span className="text-white text-xs font-bold">As Of:</span>
        <DateInput value={asOf} onChange={e => setAsOf(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
      </FilterBar>

      {/* Bucket summary */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {buckets.map(b => {
          const total = rows.filter(r => r.bucket === b).reduce((s, r) => s + r.outstanding, 0)
          const color = b === 'current' ? P.tealGr : b === '1-30' ? P.amber : P.red
          return (
            <div key={b} className="bg-white rounded-xl border p-4 text-center shadow-sm" style={{ borderColor: P.border, borderTop: `3px solid ${color}` }}>
              <div className="text-xs font-bold mb-1" style={{ color }}>{b === 'current' ? 'Current' : b + ' days'}</div>
              <div className="text-sm font-black" style={{ color: P.navyGr }}>{pkr(total)}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={THEAD_STYLE}>
              <Th>Invoice #</Th><Th>Customer</Th><Th>Date</Th><Th right>Total</Th><Th right>Outstanding</Th><Th>Bucket</Th><Th right>Days Overdue</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7}><EmptyState msg="Loading…" /></td></tr>
            : rows.length === 0 ? <tr><td colSpan={7}><EmptyState msg="No outstanding invoices." /></td></tr>
            : rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                <Td mono bold>{r.voucher_number}</Td>
                <Td>{r.party ?? ''}</Td>
                <Td>{r.date}</Td>
                <Td right>{fmt(r.total)}</Td>
                <Td right bold><span style={{ color: P.red }}>{fmt(r.outstanding)}</span></Td>
                <Td>
                  <span className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{ background: r.bucket === 'current' ? P.tealGr + '20' : P.red + '20', color: r.bucket === 'current' ? P.tealGr : P.red }}>
                    {r.bucket}
                  </span>
                </Td>
                <Td right muted>{r.days_overdue}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CashFlowReport() {
  const [from, setFrom] = useState(yearStart())
  const [to, setTo]     = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/cash-flow', { params: { from, to } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { fetch() }, [fetch])

  const op = data?.operating

  const doExportPDF = () => {
    if (!op) return
    const cols = [
      { label: 'Description', width: 120 },
      { label: 'Amount (PKR)', width: 48, right: true },
    ]
    const items = [
      ['Net Profit / (Loss)',                            op.net_profit],
      ['Add: Depreciation & Amortization (non-cash)',   op.depreciation],
      ['Change in Accounts Receivable',                 op.ar_change],
      ['Change in Accounts Payable',                    op.ap_change],
      ['Net Cash from Operating Activities',            op.total],
    ]
    const body = items.map(([label, val]) => [label, fmt(val)])
    const footerRow = ['NET CHANGE IN CASH', fmt(op.total)]
    makePDF({ title: 'Cash Flow Statement', subtitle: `Period: ${from} → ${to}`, cols, body, footerRow, orientation: 'portrait' })
  }

  const doExportXLSX = () => {
    if (!op) return
    makeXLSX({
      filename: `Cash_Flow_${from}_to_${to}.xlsx`,
      sheetName: 'Cash Flow',
      title: 'Cash Flow Statement',
      subtitle: `Period: ${from} → ${to}`,
      headers: ['Description', 'Amount (PKR)'],
      rows: [
        ['Net Profit / (Loss)',                           op.net_profit],
        ['Add: Depreciation & Amortization (non-cash)',  op.depreciation],
        ['Change in Accounts Receivable',                op.ar_change],
        ['Change in Accounts Payable',                   op.ap_change],
        ['Net Cash from Operating Activities',           op.total],
      ],
      footerRow: ['NET CHANGE IN CASH', op.total],
      colWidths: [50, 18],
    })
  }

  return (
    <div>
      <SectionHeader title="Cash Flow Statement"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!op} />} />
      <FilterBar>
        <DateInput value={from} onChange={e => setFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/60 text-xs">→</span>
        <DateInput value={to} onChange={e => setTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        {loading ? <EmptyState msg="Loading…" /> : op && (
          <>
            <div className="px-4 py-2.5" style={{ background: P.navyGr }}>
              <span className="font-black text-white text-xs" style={{ fontFamily: "'Aptos', sans-serif" }}>A. CASH FROM OPERATING ACTIVITIES</span>
            </div>
            {[
              ['Net Profit / (Loss)', op.net_profit, op.net_profit >= 0 ? P.tealGr : P.red],
              ['Add: Depreciation & Amortization (non-cash)', op.depreciation, P.muted],
              ['Change in Accounts Receivable', op.ar_change, op.ar_change >= 0 ? P.tealGr : P.red],
              ['Change in Accounts Payable', op.ap_change, op.ap_change >= 0 ? P.tealGr : P.red],
            ].map(([label, val, color], i) => (
              <div key={label} className={`flex items-center px-6 py-2 border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} style={{ borderColor: P.border + '60' }}>
                <span className="flex-1 text-xs" style={{ color: P.text }}>{label}</span>
                <span className="text-xs font-bold" style={{ color }}>{val >= 0 ? '' : '('}{fmt(Math.abs(val))}{val < 0 ? ')' : ''}</span>
              </div>
            ))}
            <div className="flex items-center px-4 py-3" style={{ background: P.navyGr }}>
              <span className="flex-1 font-black text-white text-sm" style={{ fontFamily: "'Aptos', sans-serif" }}>NET CASH FROM OPERATING ACTIVITIES</span>
              <span className={`font-black text-sm ${op.total >= 0 ? 'text-green-300' : 'text-red-300'}`}>{pkr(op.total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BudgetReport() {
  const all  = useAccounts()
  const [year, setYear]   = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [budgetRows, setBudgetRows] = useState([])
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/reports/budget-vs-actuals', { params: { year, month } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { fetch() }, [fetch])

  const startEdit = () => {
    const rows = (data?.rows ?? []).map(r => ({ account_id: r.account_id, fiscal_year: year, month: month || 1, amount: r.budget }))
    setBudgetRows(rows.length > 0 ? rows : all.filter(a => ['revenue','expense'].includes(a.account_type)).map(a => ({ account_id: a.id, fiscal_year: year, month: month || 1, amount: 0 })))
    setEditing(true)
  }

  const saveBudgets = async () => {
    setSaving(true)
    try {
      await api.post('/accounting/budgets', { rows: budgetRows.filter(r => r.amount > 0) })
      setEditing(false); fetch()
    } finally { setSaving(false) }
  }

  return (
    <div>
      <SectionHeader title="Budget vs Actuals" action={<Btn onClick={startEdit}>Edit Budgets</Btn>} />
      <FilterBar>
        <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} min="2020" max="2030"
          className="rounded-lg px-3 py-1.5 text-xs outline-none w-24"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        {['', ...MONTHS.map((m, i) => String(i + 1))].map((m, i) => (
          <FilterPill key={m} label={m ? MONTHS[parseInt(m) - 1] : 'Full Year'} active={month === m} onClick={() => setMonth(m)} />
        ))}
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={THEAD_STYLE}>
              <Th>Account</Th><Th>Category</Th><Th right>Actual</Th><Th right>Budget</Th><Th right>Variance</Th><Th right>%</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6}><EmptyState msg="Loading…" /></td></tr>
            : (data?.rows ?? []).length === 0 ? <tr><td colSpan={6}><EmptyState msg="No data. Add budgets first." /></td></tr>
            : (data?.rows ?? []).map((r, i) => {
              const pct = r.budget > 0 ? ((r.actual / r.budget) * 100).toFixed(1) : ''
              const varColor = r.variance >= 0 ? P.tealGr : P.red
              return (
                <tr key={r.account_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <Td><span className="text-xs" style={{ color: P.tealGr }}>{r.account_code}</span> {r.account_name}</Td>
                  <Td muted>{r.level_2}</Td>
                  <Td right bold>{fmt(r.actual)}</Td>
                  <Td right>{fmt(r.budget)}</Td>
                  <Td right><span style={{ color: varColor }}>{r.variance >= 0 ? '+' : ''}{fmt(r.variance)}</span></Td>
                  <Td right muted>{pct !== '' ? pct + '%' : ''}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Budget Edit Modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Budget Amounts" width="max-w-2xl">
        <div className="max-h-96 overflow-y-auto space-y-2 mb-4">
          {budgetRows.map((r, i) => {
            const acc = all.find(a => a.id === r.account_id)
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="flex-1 text-xs" style={{ color: P.text }}>{acc?.account_code} · {acc?.account_name}</span>
                <input type="number" step="0.01" min="0" value={r.amount}
                  onChange={e => setBudgetRows(p => p.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                  className="w-32 px-2 py-1 rounded border text-xs text-right outline-none" style={{ borderColor: P.border }} />
              </div>
            )
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setEditing(false)}>Cancel</Btn>
          <Btn onClick={saveBudgets} disabled={saving}>{saving ? 'Saving…' : 'Save Budgets'}</Btn>
        </div>
      </Modal>
    </div>
  )
}

export function ReportsTab() {
  const REPORT_TYPES = [
    { key: 'pnl',      label: 'Profit & Loss' },
    { key: 'bs',       label: 'Balance Sheet' },
    { key: 'ar',       label: 'AR Ageing' },
    { key: 'cf',       label: 'Cash Flow' },
    { key: 'budget',   label: 'Budget vs Actuals' },
  ]
  const [report, setReport] = useState('pnl')

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {REPORT_TYPES.map(r => (
          <button key={r.key} onClick={() => setReport(r.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-black transition-all"
            style={report === r.key
              ? { background: P.tealGr, color: '#fff' }
              : { background: P.white, color: P.tealGr, border: `1px solid ${P.tealGr}` }}>
            {r.label}
          </button>
        ))}
      </div>
      {report === 'pnl'    && <PnLReport />}
      {report === 'bs'     && <BalanceSheetReport />}
      {report === 'ar'     && <ARAgeing />}
      {report === 'cf'     && <CashFlowReport />}
      {report === 'budget' && <BudgetReport />}
    </div>
  )
}
