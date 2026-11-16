'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { money, fmtDate, fmtPeriod, inputStyle, labelStyle, btn, NAVY, TEAL, F } from './invoiceShared'

// The one invoice form (argroup's), for the call center: an invoice bills one line's final
// approved sales (invoicing is line by line) and goes on its client's ledger. Which way in it is
// comes from the invoice it was handed:
//
//   no invoice        a new invoice: pick the line (from the client's lines when a client was
//                     handed over) and the sale dates, tick the approved sales to bill
//   a DRAFT invoice   from Invoice Approval: its sales are ticked, later approvals can be added
//   an issued invoice the sales are fixed; discount, adjustment, dates and notes can change
//
// The total adds itself up from the ticked sales' rates, less the discount, plus the adjustment.

type Row = {
  customerId: string; name: string; phone: string | null; saleDate: string; finalApprovedAt: string | null
  agent: string; verticalType: string | null; rate: string; on: boolean
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const plusDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const approvedDay = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : ''

type LineOpt = { id: string; companyId: string; companyName: string; lineName: string; didCode: string | null; isActive: boolean; company?: { id: string; name: string } }

export default function InvoiceFormPanel({ clientId: givenClient, lineId: givenLine, clientName: givenName, inv, period, onClose, onSaved }: {
  /** The client (whose ledger): the line is picked from its lines */
  clientId?: string
  /** The line to invoice, when already known (an "invoice due" row) */
  lineId?: string
  clientName?: string
  inv?: any | null
  /** Sale dates to start with, e.g. the billing period an "invoice due" row is for */
  period?: { start: string; end: string } | null
  onClose: () => void
  onSaved: () => void
}) {
  const fixedLine = givenLine ?? inv?.lineId ?? null
  const [lineId, setLineId] = useState<string>(fixedLine ?? '')
  const [lines,  setLines]  = useState<LineOpt[]>([])
  useEffect(() => {
    if (fixedLine) return
    api.get('/clients', { params: { perPage: 'all' } }).then(({ data }) => {
      const all = ((data?.data ?? data) as LineOpt[]).filter(l => !givenClient || l.companyId === givenClient)
      setLines(all)
      if (givenClient && all.length === 1) setLineId(all[0].id)   // a one-line client: nothing to pick
    }).catch(() => {})
  }, [fixedLine, givenClient])
  const pickedLine = lines.find(l => l.id === lineId)
  const clientName = givenName ?? inv?.client?.businessName ?? pickedLine?.company?.name ?? ''
  const lineLabel  = inv?.line?.companyName ?? pickedLine?.companyName ?? ''
  const isEdit  = !!inv
  const isDraft = inv?.status === 'DRAFT'
  const salesFixed = isEdit && !isDraft

  const [rows,       setRows]       = useState<Row[]>([])
  const [loading,    setLoading]    = useState(!salesFixed)
  const [show,       setShow]       = useState<'all' | 'ticked'>('all')
  const [from,       setFrom]       = useState(period?.start ?? '')
  const [to,         setTo]         = useState(period?.end ?? '')
  const [discount,   setDiscount]   = useState(inv?.discount ? String(Number(inv.discount)) : '')
  const [adjustment, setAdjustment] = useState(inv?.adjustment ? String(Number(inv.adjustment)) : '')
  const [issueDate,  setIssueDate]  = useState<string>(inv?.issueDate ?? today())
  const [dueDate,    setDueDate]    = useState<string>(inv?.dueDate ?? plusDays(inv?.issueDate ?? today(), 7))
  const [description, setDescription] = useState(inv?.description ?? '')
  const [notes,      setNotes]      = useState(inv?.notes ?? '')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  // The sales on the invoice, plus (for a draft or a new one) the client's sales not invoiced yet
  useEffect(() => {
    const onIt: Row[] = (inv?.items ?? []).map((it: any) => ({
      customerId: it.customerId, name: it.customer?.name ?? '', phone: it.customer?.phone ?? null, saleDate: it.customer?.saleDate ?? '',
      finalApprovedAt: it.customer?.finalApprovedAt ?? null, agent: it.customer?.agent ?? '', verticalType: it.customer?.verticalType ?? null,
      rate: String(Number(it.rate)), on: true,
    }))
    if (salesFixed) { setRows(onIt); return }
    if (!lineId) { setRows([]); setLoading(false); return }
    setLoading(true)
    api.get(`/invoices/unbilled/${lineId}`)
      .then(({ data }) => {
        const list = (data?.data ?? data) as any[]
        const free: Row[] = list.map(s => ({
          customerId: s.id, name: s.name, phone: s.phone, saleDate: s.saleDate, finalApprovedAt: s.finalApprovedAt,
          agent: s.agent, verticalType: s.verticalType, rate: String(Number(s.rate)), on: false,
        }))
        setRows([...onIt, ...free])
      })
      .catch(() => setRows(onIt))
      .finally(() => setLoading(false))
  }, [lineId, inv?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => rows.filter(r => {
    if (show === 'ticked' && !r.on) return false
    if (from && r.saleDate < from) return false
    if (to && r.saleDate > to) return false
    return true
  }), [rows, show, from, to])

  const ticked    = rows.filter(r => r.on)
  const subtotal  = ticked.reduce((s, r) => s + (Number(r.rate) || 0), 0)
  const nDiscount = Number(discount) || 0
  const nAdjust   = Number(adjustment) || 0
  const total     = Math.round((subtotal - nDiscount + nAdjust) * 100) / 100
  const allOn     = visible.length > 0 && visible.every(r => r.on)

  const setRow = (id: string, patch: Partial<Row>) => setRows(prev => prev.map(r => (r.customerId === id ? { ...r, ...patch } : r)))
  const toggleAll = () => {
    const ids = new Set(visible.map(r => r.customerId))
    setRows(prev => prev.map(r => (ids.has(r.customerId) ? { ...r, on: !allOn } : r)))
  }

  // `send` separates saving a draft from issuing it
  async function save(send: boolean) {
    if (send && total <= 0) { setError('The invoice total must be above zero to send it.'); return }
    if (!lineId) { setError('Pick the line first.'); return }
    if (!salesFixed && !ticked.length && nAdjust <= 0) { setError('Tick at least one sale, or enter an adjustment to bill.'); return }
    if (total < 0) { setError('The invoice total cannot be below zero.'); return }
    setSaving(true); setError('')
    try {
      const days = ticked.map(r => r.saleDate).filter(Boolean).sort()
      const body: Record<string, unknown> = {
        discount: nDiscount, adjustment: nAdjust, issueDate, dueDate,
        description: description.trim() || undefined, notes: notes.trim() || null,
        ...(salesFixed ? {} : { items: ticked.map(r => ({ customerId: r.customerId, rate: Number(r.rate) || 0 })) }),
      }
      let id = inv?.id
      if (isEdit) {
        await api.patch(`/invoices/${id}`, body)
      } else {
        const { data } = await api.post('/invoices', {
          lineId, ...body,
          // The invoice covers the sale dates picked, or the ticked sales' dates when none were
          periodStart: from || days[0] || issueDate, periodEnd: to || days[days.length - 1] || issueDate,
        })
        id = (data?.data ?? data).id
      }
      if (send && (!isEdit || isDraft)) await api.post(`/invoices/${id}/send`)
      onSaved()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not save the invoice')
    } finally { setSaving(false) }
  }

  const title = !isEdit ? 'New Invoice' : isDraft ? inv.invoiceNumber : `Edit ${inv.invoiceNumber}`
  const th: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 1, background: '#F1F5F9', padding: '7px 10px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#475569', borderBottom: `1px solid ${P.border}`, whiteSpace: 'nowrap', fontFamily: F }
  const td: React.CSSProperties = { padding: '6px 10px', borderBottom: `1px solid ${P.border}60`, fontSize: 12.5, whiteSpace: 'nowrap', fontFamily: F }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', fontFamily: F }}>
      {/* Header */}
      <div style={{ background: P.teal, color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <h2 style={{ fontFamily: F, fontSize: 22, fontWeight: 800, display: 'inline-block', color: '#F1F5F9', letterSpacing: '0.04em', margin: 0, whiteSpace: 'nowrap' }}>{title}</h2>
          {(lineLabel || clientName) && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700 }}>{lineLabel || clientName}</span>}
          {inv?.billingPeriodStart && inv.kind === 'CYCLE' && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.18)', color: '#E2E8F0', fontWeight: 700, whiteSpace: 'nowrap' }}>Cycle {fmtPeriod(inv)}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 900, color: '#F1F5F9', fontSize: 14 }}>{money(total)}</span>
            <span style={{ color: '#CBD5E1', fontWeight: 600, fontSize: 12 }}>Invoice Total</span>
          </span>
          <button onClick={onClose} style={{ cursor: 'pointer', color: '#E2E8F0', fontWeight: 700, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontFamily: F }}>
            ← Back
          </button>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {/* Which client and which sale dates */}
        {!salesFixed && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Line <span style={{ color: '#ef4444' }}>*</span></label>
              {fixedLine || (givenClient && lines.length === 1) ? (
                <div style={{ ...inputStyle, background: '#F8FAFC', fontWeight: 700, color: NAVY }}>{lineLabel || clientName}</div>
              ) : (
                <StyledSelect value={lineId} onChange={v => { setLineId(v); setRows([]) }} placeholder={givenClient ? `Select a line of ${clientName}` : 'Select line'}
                  options={lines.slice().sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.companyName.localeCompare(b.companyName))
                    .map(l => ({ value: l.id, label: `${l.companyName}${l.didCode ? ` (${l.didCode})` : ''}${l.isActive ? '' : ' (inactive)'}` }))} />
              )}
            </div>
            <div>
              <label style={labelStyle}>Sales from</label>
              <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Sales to</label>
              <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        {/* The sales being billed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>
            {salesFixed ? 'Sales on this invoice' : 'Approved sales'}{' '}
            <span style={{ color: TEAL }}>{ticked.length} ticked · {money(subtotal)}</span>
          </span>
          {!salesFixed && (
            <>
              <span style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 2, background: '#F1F5F9', borderRadius: 30, padding: 2 }}>
                {([['all', 'All'], ['ticked', 'Ticked only']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setShow(k)} style={{ padding: '3px 12px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: F, background: show === k ? NAVY : 'transparent', color: show === k ? '#fff' : '#475569' }}>{l}</button>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ border: `1px solid ${P.border}`, borderRadius: 10, overflow: 'auto', maxHeight: 380, marginBottom: 18 }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                {!salesFixed && (
                  <th style={{ ...th, width: 36, textAlign: 'center' }}>
                    <input type="checkbox" checked={allOn} onChange={toggleAll} disabled={!visible.length} style={{ accentColor: TEAL, cursor: 'pointer' }} title="Tick all shown" />
                  </th>
                )}
                <th style={th}>Customer</th><th style={th}>Phone</th><th style={th}>Sale Date</th><th style={th}>Final Approved</th>
                <th style={th}>Vertical</th><th style={th}>Agent</th><th style={{ ...th, textAlign: 'right', width: 120 }}>Rate (USD)</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: P.textMuted, padding: 24 }}>Loading sales…</td></tr>}
              {!loading && !visible.length && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: P.textMuted, padding: 24, whiteSpace: 'normal' }}>
                  {salesFixed ? 'No sales on this invoice.' : !lineId ? 'Pick a line to see its approved sales.' : (from || to) ? 'No approved sales waiting to be invoiced in these dates.' : 'No approved sales waiting to be invoiced on this line.'}
                </td></tr>
              )}
              {!loading && visible.map(r => (
                <tr key={r.customerId} style={{ background: r.on && !salesFixed ? '#F0FDFA' : undefined }}>
                  {!salesFixed && (
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input type="checkbox" checked={r.on} onChange={() => setRow(r.customerId, { on: !r.on })} style={{ accentColor: TEAL, cursor: 'pointer' }} />
                    </td>
                  )}
                  <td style={{ ...td, fontWeight: 700, color: NAVY }}>{r.name}</td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Consolas, monospace' }}>{r.phone ?? ''}</td>
                  <td style={{ ...td, color: '#64748B' }}>{fmtDate(r.saleDate)}</td>
                  <td style={{ ...td, color: '#64748B' }}>{fmtDate(approvedDay(r.finalApprovedAt))}</td>
                  <td style={td}>{r.verticalType ?? ''}</td>
                  <td style={{ ...td, color: '#475569' }}>{r.agent}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {salesFixed ? <b>{money(r.rate)}</b> : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ color: '#94A3B8' }}>$</span>
                        <input type="number" min={0} step="0.01" value={r.rate} onChange={e => setRow(r.customerId, { rate: e.target.value, on: true })}
                          style={{ ...inputStyle, width: 84, padding: '3px 6px', fontSize: 12, textAlign: 'right' }} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Discount (USD)</label>
            <input type="number" min={0} step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Adjustment (USD, + or −)</label>
            <input type="number" step="0.01" value={adjustment} onChange={e => setAdjustment(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Invoice Date</label>
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Filled in from the sales if left empty" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything worth recording against this invoice" style={inputStyle} />
          </div>
        </div>

        {/* How the total is made up */}
        <div style={{ borderTop: `1px solid ${P.border}`, borderBottom: `1px solid ${P.border}`, padding: '8px 0', fontSize: 13 }}>
          {[
            [`Sales (${ticked.length})`, money(subtotal)],
            ...(nDiscount ? [['Discount', `− ${money(nDiscount)}`]] : []),
            ...(nAdjust ? [['Adjustment', `${nAdjust < 0 ? '− ' : '+ '}${money(Math.abs(nAdjust))}`]] : []),
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#475569' }}><span>{k}</span><span style={{ fontWeight: 700 }}>{v}</span></div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
            <span style={{ fontWeight: 800, color: '#64748B' }}>Invoice Total</span>
            <span style={{ fontWeight: 900, color: NAVY }}>{money(total)}</span>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
          {salesFixed ? (
            <button onClick={() => save(false)} disabled={saving} style={{ ...btn(TEAL), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save changes'}</button>
          ) : (
            <>
              <button onClick={() => save(false)} disabled={saving} style={{ ...btn('#fff', NAVY), border: `1px solid ${P.border}`, opacity: saving ? 0.6 : 1 }}>
                {isDraft ? 'Save Draft' : 'Save as Draft'}
              </button>
              <button onClick={() => save(true)} disabled={saving || total <= 0} style={{ ...btn(TEAL), opacity: (saving || total <= 0) ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save Invoice'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
