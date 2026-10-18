// @ts-nocheck
'use client'

// General Ledger: every posted line for an account and period.

import { useState, useEffect, useCallback } from 'react'
import api from './accApi'
import DateInput from '@/components/ui/DateInput'
import { P, today, yearStart, pkr, fmt, makePDF, makeXLSX, ExportBtn, SectionHeader, Btn, FilterBar, FilterPill, Badge, EmptyState, TableSelect, Th, Td, THEAD_STYLE } from './shared'
import { useAccounts } from './TransactionsTab'
// ══════════════════════════════════════════════════════════════════════════════
// MODULE 4: GENERAL LEDGER
// ══════════════════════════════════════════════════════════════════════════════

export function GLTab() {
  const all = useAccounts()
  const [accountId, setAccountId] = useState('')
  const [from, setFrom]           = useState(yearStart())
  const [to, setTo]               = useState(today())
  const [vType, setVType]         = useState('')
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [page, setPage]           = useState(1)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/gl', { params: { account_id: accountId, from, to, voucher_type: vType, page, per_page: 100 } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [accountId, from, to, vType, page])

  useEffect(() => { fetch() }, [fetch])

  const rows = data?.data ?? []

  const [exporting, setExporting] = useState(false)

  const fetchAllGL = async () => {
    const r = await api.get('/accounting/gl', { params: { account_id: accountId, from, to, voucher_type: vType, page: 1, per_page: 9999 } })
    return r.data.data ?? []
  }

  const doExportPDF = async () => {
    setExporting(true)
    try {
      const allRows = await fetchAllGL()
      const accountName = accountId
        ? (all.find(a => String(a.id) === String(accountId))?.account_name ?? 'Selected Account')
        : 'All Accounts'
      const cols = [
        { label: 'Date',         width: 20 },
        { label: 'Voucher #',    width: 24, bold: true },
        { label: 'Type',         width: 13 },
        { label: 'Account',      width: 20 },
        { label: 'Party',        width: 28 },
        { label: 'Description',  width: 58 },
        { label: 'Debit (PKR)',  width: 26, right: true },
        { label: 'Credit (PKR)', width: 26, right: true },
        { label: 'Balance',      width: 26, right: true },
      ]
      const body = allRows.map(r => [
        r.date,
        r.voucher_number,
        r.voucher_type,
        r.account_code,
        r.party_name ?? '',
        r.description ?? r.voucher_memo ?? '',
        r.debit_pkr > 0  ? fmt(r.debit_pkr)  : '',
        r.credit_pkr > 0 ? fmt(r.credit_pkr) : '',
        fmt(Math.abs(r.running_balance)) + (r.running_balance < 0 ? ' Cr' : ' Dr'),
      ])
      makePDF({ title: 'General Ledger', subtitle: `Account: ${accountName}  |  Period: ${from} → ${to}`, cols, body, orientation: 'landscape' })
    } finally { setExporting(false) }
  }

  const doExportXLSX = async () => {
    setExporting(true)
    try {
      const allRows = await fetchAllGL()
      const accountName = accountId
        ? (all.find(a => String(a.id) === String(accountId))?.account_name ?? 'Selected Account')
        : 'All Accounts'
      makeXLSX({
        filename: `General_Ledger_${from}_to_${to}.xlsx`,
        sheetName: 'General Ledger',
        title: 'General Ledger',
        subtitle: `Account: ${accountName}  |  Period: ${from} → ${to}`,
        headers: ['Date', 'Voucher #', 'Type', 'Account Code', 'Party', 'Description', 'Debit (PKR)', 'Credit (PKR)', 'Balance'],
        rows: allRows.map(r => [
          r.date, r.voucher_number, r.voucher_type, r.account_code,
          r.party_name ?? '', r.description ?? r.voucher_memo ?? '',
          r.debit_pkr > 0  ? r.debit_pkr  : '',
          r.credit_pkr > 0 ? r.credit_pkr : '',
          fmt(Math.abs(r.running_balance)) + (r.running_balance < 0 ? ' Cr' : ' Dr'),
        ]),
        colWidths: [12, 16, 10, 14, 20, 40, 16, 16, 18],
      })
    } finally { setExporting(false) }
  }

  return (
    <div>
      <SectionHeader title="General Ledger" subtitle="Every posted transaction line with running balance"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={exporting} />} />

      <FilterBar>
        {/* TableSelect opens as a fixed overlay, so the scrolling filter bar cannot clip it */}
        <div className="shrink-0" style={{ width: 240 }}>
          <TableSelect value={accountId} onChange={v => { setAccountId(v); setPage(1) }} placeholder="All Accounts"
            options={all.map(a => ({ value: String(a.id), label: `${a.account_code} · ${a.account_name}` }))} />
        </div>
        <DateInput value={from} onChange={e => setFrom(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        <span className="text-white/60 text-xs">→</span>
        <DateInput value={to} onChange={e => setTo(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        {['', 'BPV','CPV','BRV','CRV','JV','INV','BILL','CHQ'].map(t => (
          <FilterPill key={t} label={t || 'All'} active={vType === t} onClick={() => setVType(t)} />
        ))}
      </FilterBar>

      {data?.opening_balance !== undefined && data.opening_balance !== 0 && (
        <div className="mb-3 px-4 py-2 rounded-lg text-xs font-bold" style={{ background: P.tealGr + '12', color: P.tealDk, border: `1px solid ${P.tealGr}30` }}>
          Opening Balance: {pkr(data.opening_balance)}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 900 }}>
            <thead>
              <tr style={THEAD_STYLE}>
                <Th>Date</Th><Th>Voucher #</Th><Th>Type</Th><Th>Account</Th><Th>Party</Th>
                <Th>Description</Th><Th right>Debit</Th><Th right>Credit</Th><Th right>Balance</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}><EmptyState msg="Loading…" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9}><EmptyState msg="No entries found." /></td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <Td>{r.date}</Td>
                  <Td mono bold><span style={{ color: P.tealGr }}>{r.voucher_number}</span></Td>
                  <Td><Badge type={r.voucher_type} /></Td>
                  <Td><span className="text-xs" style={{ color: P.muted }}>{r.account_code}</span></Td>
                  <Td muted>{r.party_name ?? ''}</Td>
                  <Td muted>{r.description ?? r.voucher_memo ?? ''}</Td>
                  <Td right>{r.debit_pkr > 0 ? fmt(r.debit_pkr) : ''}</Td>
                  <Td right>{r.credit_pkr > 0 ? fmt(r.credit_pkr) : ''}</Td>
                  <Td right bold>
                    <span style={{ color: r.running_balance >= 0 ? P.tealGr : P.red }}>
                      {fmt(Math.abs(r.running_balance))} {r.running_balance < 0 ? 'Cr' : 'Dr'}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.meta && (
          <div className="px-4 py-2.5 border-t flex items-center justify-between text-xs" style={{ borderColor: P.border, color: P.muted }}>
            <span>Total {data.meta.total} entries</span>
            <div className="flex gap-2">
              <Btn variant="ghost" size="xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
              <span className="px-2 py-1 text-xs">Page {data.meta.current_page} / {data.meta.last_page}</span>
              <Btn variant="ghost" size="xs" disabled={page >= data.meta.last_page} onClick={() => setPage(p => p + 1)}>Next →</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
