// @ts-nocheck
'use client'

// Trial Balance.

import { useState, useEffect, useCallback, useMemo } from 'react'
import api from './accApi'
import DateInput from '@/components/ui/DateInput'
import { P, today, yearStart, fmt, makePDF, makeXLSX, ExportBtn, SectionHeader, FilterBar, EmptyState, Td } from './shared'
// ══════════════════════════════════════════════════════════════════════════════
// MODULE 5: TRIAL BALANCE
// ══════════════════════════════════════════════════════════════════════════════

export function TBTab() {
  const [asOf, setAsOf]       = useState(today())
  const [from, setFrom]       = useState(yearStart())
  const [hideZero, setHideZero] = useState(true)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState({})

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/accounting/tb', { params: { as_of: asOf, from, hide_zero: hideZero ? 1 : 0 } })
      setData(r.data)
    } finally { setLoading(false) }
  }, [asOf, from, hideZero])

  useEffect(() => { fetch() }, [fetch])

  const rows = data?.rows ?? []
  const toggle = (k) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  // Group rows by L1 → L2
  const tree = useMemo(() => {
    const g = {}
    for (const r of rows) {
      if (!g[r.level_1]) g[r.level_1] = {}
      if (!g[r.level_1][r.level_2]) g[r.level_1][r.level_2] = []
      g[r.level_1][r.level_2].push(r)
    }
    return g
  }, [rows])

  const cols = ['ob', 'act', 'cl']
  const colLabels = {
    ob: 'Opening Balance', act: 'Period Activity', cl: 'Closing Balance'
  }

  const doExportPDF = () => {
    if (!rows.length) return
    const pdfCols = [
      { label: 'Code',         width: 20 },
      { label: 'Account Name', width: 54 },
      { label: 'OB Debit',    width: 28, right: true },
      { label: 'OB Credit',   width: 28, right: true },
      { label: 'Activity Dr', width: 28, right: true },
      { label: 'Activity Cr', width: 28, right: true },
      { label: 'Closing Dr',  width: 28, right: true },
      { label: 'Closing Cr',  width: 28, right: true },
    ]
    const body = rows.map(r => [
      r.account_code, r.account_name,
      r.ob_debit  > 0 ? fmt(r.ob_debit)  : '',
      r.ob_credit > 0 ? fmt(r.ob_credit) : '',
      r.act_debit  > 0 ? fmt(r.act_debit)  : '',
      r.act_credit > 0 ? fmt(r.act_credit) : '',
      r.cl_debit  > 0 ? fmt(r.cl_debit)  : '',
      r.cl_credit > 0 ? fmt(r.cl_credit) : '',
    ])
    const footerRow = [
      '', 'TOTAL',
      fmt(rows.reduce((s, r) => s + (r.ob_debit  || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.ob_credit || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.act_debit  || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.act_credit || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.cl_debit  || 0), 0)),
      fmt(rows.reduce((s, r) => s + (r.cl_credit || 0), 0)),
    ]
    makePDF({ title: 'Trial Balance', subtitle: `From: ${from}  |  As Of: ${asOf}`, cols: pdfCols, body, footerRow, orientation: 'landscape' })
  }

  const doExportXLSX = () => {
    if (!rows.length) return
    makeXLSX({
      filename: `Trial_Balance_${asOf}.xlsx`,
      sheetName: 'Trial Balance',
      title: 'Trial Balance',
      subtitle: `From: ${from}  |  As Of: ${asOf}`,
      headers: ['Code', 'Account Name', 'OB Debit', 'OB Credit', 'Activity Dr', 'Activity Cr', 'Closing Dr', 'Closing Cr'],
      rows: rows.map(r => [
        r.account_code, r.account_name,
        r.ob_debit  || 0, r.ob_credit || 0,
        r.act_debit || 0, r.act_credit || 0,
        r.cl_debit  || 0, r.cl_credit || 0,
      ]),
      footerRow: [
        '', 'TOTAL',
        rows.reduce((s, r) => s + (r.ob_debit  || 0), 0),
        rows.reduce((s, r) => s + (r.ob_credit || 0), 0),
        rows.reduce((s, r) => s + (r.act_debit  || 0), 0),
        rows.reduce((s, r) => s + (r.act_credit || 0), 0),
        rows.reduce((s, r) => s + (r.cl_debit  || 0), 0),
        rows.reduce((s, r) => s + (r.cl_credit || 0), 0),
      ],
      colWidths: [14, 40, 16, 16, 16, 16, 16, 16],
    })
  }

  return (
    <div>
      <SectionHeader title="Trial Balance" subtitle="Debits must equal Credits; any discrepancy indicates an error"
        action={<ExportBtn onPDF={doExportPDF} onXLSX={doExportXLSX} disabled={!rows.length} />} />

      <FilterBar>
        <div className="flex items-center gap-2 text-white text-xs font-bold">
          <span>From:</span>
          <DateInput value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        </div>
        <div className="flex items-center gap-2 text-white text-xs font-bold">
          <span>As Of:</span>
          <DateInput value={asOf} onChange={e => setAsOf(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }} />
        </div>
        <label className="flex items-center gap-1.5 text-white text-xs font-bold cursor-pointer">
          <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} />
          Hide zero-balance
        </label>
      </FilterBar>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1100 }}>
            <thead>
              <tr style={{ background: '#F2AC18' }}>
                <th className="whitespace-nowrap text-left" style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>Account Code</th>
                <th className="whitespace-nowrap text-left" style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>Account Name</th>
                {cols.map(c => [
                  <th key={c+'d'} className="whitespace-nowrap text-right" style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>{colLabels[c]} Dr</th>,
                  <th key={c+'c'} className="whitespace-nowrap text-right" style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, color: '#1a1a1a' }}>{colLabels[c]} Cr</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><EmptyState msg="Loading…" /></td></tr>
              ) : Object.entries(tree).map(([l1, l2Map]) => {
                const l1Rows = Object.values(l2Map).flat()
                return [
                  <tr key={l1} style={{ background: P.navyGr }}>
                    <td colSpan={8} className="px-4 py-3 font-black text-white text-xs cursor-pointer"
                      style={{ fontFamily: "'Aptos', sans-serif" }}
                      onClick={() => toggle(l1)}>
                      {collapsed[l1] ? '▶' : '▼'} {l1}
                    </td>
                  </tr>,
                  !collapsed[l1] && Object.entries(l2Map).map(([l2, subRows]) => [
                    <tr key={l1 + l2} style={{ background: P.tealDk + '18', cursor: 'pointer' }} onClick={() => toggle(l1 + l2)}>
                      <td colSpan={8} className="px-6 py-2.5 text-xs font-bold" style={{ color: P.tealDk }}>
                        {collapsed[l1 + l2] ? '▶' : '▼'} {l2}
                      </td>
                    </tr>,
                    !collapsed[l1 + l2] && subRows.map((r, i) => (
                      <tr key={r.account_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                        <Td mono><span style={{ color: P.tealGr }}>{r.account_code}</span></Td>
                        <Td>{r.account_name}</Td>
                        {cols.map(c => [
                          <Td key={c + 'd'} right>{r[c + '_debit'] > 0 ? fmt(r[c + '_debit']) : ''}</Td>,
                          <Td key={c + 'c'} right>{r[c + '_credit'] > 0 ? fmt(r[c + '_credit']) : ''}</Td>,
                        ])}
                      </tr>
                    )),
                    // L2 subtotal
                    !collapsed[l1 + l2] && (
                      <tr key={l1 + l2 + '_total'} style={{ background: P.gold + '15' }}>
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-black" style={{ color: P.navyGr }}>Subtotal: {l2}</td>
                        {cols.map(c => {
                          const d = subRows.reduce((s, r) => s + r[c + '_debit'], 0)
                          const cr = subRows.reduce((s, r) => s + r[c + '_credit'], 0)
                          return [
                            <td key={c+'d'} className="px-3 py-2.5 text-xs font-black text-right" style={{ color: P.navyGr }}>{d > 0 ? fmt(d) : ''}</td>,
                            <td key={c+'c'} className="px-3 py-2.5 text-xs font-black text-right" style={{ color: P.navyGr }}>{cr > 0 ? fmt(cr) : ''}</td>,
                          ]
                        })}
                      </tr>
                    ),
                  ])
                ]
              })}
            </tbody>
            {data && (
              <tfoot>
                <tr style={{ background: 'linear-gradient(90deg, rgba(14,95,110,0.12) 0%, rgba(30,132,150,0.12) 100%)', borderTop: '2px solid #1E8496' }}>
                  <td colSpan={2} className="px-4 py-3 font-black text-xs" style={{ color: P.tealDk }}>TOTAL</td>
                  {cols.map(c => {
                    const d = rows.reduce((s, r) => s + r[c + '_debit'], 0)
                    const cr = rows.reduce((s, r) => s + r[c + '_credit'], 0)
                    return [
                      <td key={c+'d'} className="px-3 py-3 font-black text-xs text-right" style={{ color: P.tealDk }}>{fmt(d)}</td>,
                      <td key={c+'c'} className="px-3 py-3 font-black text-xs text-right" style={{ color: P.tealDk }}>{fmt(cr)}</td>,
                    ]
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
