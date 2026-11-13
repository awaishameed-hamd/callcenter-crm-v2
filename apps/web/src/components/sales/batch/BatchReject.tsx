'use client'

// Batch final rejection: pick the client and the sale dates, tick the sales the client rejected,
// and they are final rejected together ("Rejected by Client", as a single final reject).

import { useEffect, useMemo, useState } from 'react'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import { apiGet, apiPost, errMsg } from '@/lib/api'
import { fmtDay, periodDates } from '@/lib/format'
import { P } from '@/lib/palette'
import { FONT } from '../saleUi'
import { BatchShell, Btn, Pill, Label, Confirm, ClientPicker, RateTag, useClients, RED } from './batchUi'

type Row = { id: string; name: string; phone: string | null; verticalType: string | null; agent: string; saleDate: string; saleTimeEst: string | null }

const dateStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E0DDD5', fontSize: 13, fontFamily: FONT, color: P.navy, outline: 'none', background: '#fff' }
const th: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 1, background: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #EEF2F6', whiteSpace: 'nowrap', fontSize: 12.5 }

export default function BatchReject({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const clients = useClients()
  const week = periodDates('week')!
  const [clientId, setClientId] = useState('')
  const [from, setFrom]         = useState(week.dateFrom)
  const [to, setTo]             = useState(week.dateTo)
  const [rows, setRows]         = useState<Row[]>([])
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState('')
  const [search, setSearch]     = useState('')
  const [picked, setPicked]     = useState<Set<string>>(new Set())
  const [confirm, setConfirm]   = useState(false)
  const [busy, setBusy]         = useState(false)
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const client = clients.find(c => c.id === clientId)

  const load = async () => {
    if (!clientId || !from || !to) { setRows([]); return }
    setLoading(true); setErr('')
    try {
      setRows(await apiGet<Row[]>('/final-batch/pending', { clientId, dateFrom: from, dateTo: to }))
    } catch (e) {
      setRows([]); setErr(errMsg(e, 'Could not load the sales.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { setPicked(new Set()); load() }, [clientId, from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    if (!q) return rows
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.agent.toLowerCase().includes(q) || (digits && (r.phone ?? '').replace(/\D/g, '').includes(digits)))
  }, [rows, search])
  const allOn = visible.length > 0 && visible.every(r => picked.has(r.id))
  const toggleAll = () => setPicked(prev => {
    const next = new Set(prev)
    visible.forEach(r => (allOn ? next.delete(r.id) : next.add(r.id)))
    return next
  })
  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const reject = async () => {
    setBusy(true)
    try {
      const res = await apiPost<{ rejected: number; skipped: number; message: string }>('/final-batch/reject', { clientId, ids: [...picked] })
      setToast({ message: res.message, type: res.skipped ? 'error' : 'success' })
      setPicked(new Set())
      onChanged()
      await load()
    } catch (e) {
      setToast({ message: errMsg(e, 'Rejection failed.'), type: 'error' })
    } finally {
      setBusy(false); setConfirm(false)
    }
  }

  const sub = client ? `${client.companyName}${client.didCode ? ` (${client.didCode})` : ''}` : 'Reject a client\'s waiting sales in one go'

  return (
    <BatchShell tone={RED} caption="FINAL APPROVAL" title="Batch Reject" sub={sub} onClose={onClose}
      footer={
        <>
          <div style={{ fontSize: 12.5, color: P.slate, display: 'flex', gap: 8, alignItems: 'center' }}>
            {clientId ? <><Pill color={P.navy}>{rows.length} waiting</Pill>{picked.size > 0 && <Pill color={RED}>{picked.size} selected</Pill>}</> : 'Pick a client and the sale dates.'}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Btn tone="ghost" onClick={onClose}>Close</Btn>
            <Btn tone="red" disabled={!picked.size || busy} onClick={() => setConfirm(true)}>Reject {picked.size || ''} Selected</Btn>
          </div>
        </>
      }>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ flexShrink: 0, padding: '12px 20px', borderBottom: `1px solid ${P.border}`, display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 300 }}>
          <Label>Client</Label>
          <ClientPicker clients={clients} value={clientId} onChange={setClientId} />
        </div>
        <div style={{ paddingBottom: 8 }}><RateTag client={client} /></div>
        <div style={{ width: 160 }}>
          <Label>Sale date from</Label>
          <DateInput value={from} max={to} onChange={e => setFrom(e.target.value)} style={dateStyle} />
        </div>
        <div style={{ width: 160 }}>
          <Label>To</Label>
          <DateInput value={to} min={from} onChange={e => setTo(e.target.value)} style={dateStyle} />
        </div>
        <div style={{ marginLeft: 'auto', width: 260 }}>
          <Label>Search</Label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, phone or agent"
            style={{ ...dateStyle, width: '100%', boxSizing: 'border-box' }} />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: clientId ? '#fff' : '#F7F8FA' }}>
        {err && <div style={{ margin: '14px 20px', padding: '10px 14px', borderRadius: 10, border: '1px solid #FECACA', background: '#FEF2F2', color: RED, fontSize: 13, fontWeight: 600 }}>{err}</div>}
        {!clientId && <p style={{ textAlign: 'center', color: P.textMuted, fontSize: 13, marginTop: 60 }}>Pick a client to see its sales waiting for final approval.</p>}
        {clientId && (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, color: '#1F2937' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 40, textAlign: 'center' }}>
                  <input type="checkbox" checked={allOn} onChange={toggleAll} disabled={!visible.length} style={{ accentColor: RED, cursor: 'pointer' }} />
                </th>
                <th style={th}>Customer</th><th style={th}>Phone</th><th style={th}>Agent</th><th style={th}>Vertical</th><th style={th}>Sale Date</th><th style={th}>Sale Time (EST)</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: P.textMuted, padding: 30 }}>Loading...</td></tr>}
              {!loading && !visible.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: P.textMuted, padding: 30 }}>No sales waiting for final approval in these dates.</td></tr>}
              {!loading && visible.map(r => {
                const on = picked.has(r.id)
                return (
                  <tr key={r.id} onClick={() => toggle(r.id)} style={{ background: on ? '#FEF2F2' : undefined, cursor: 'pointer' }}>
                    <td style={{ ...td, textAlign: 'center', boxShadow: on ? `inset 3px 0 0 ${RED}` : undefined }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(r.id)} onClick={e => e.stopPropagation()} style={{ accentColor: RED, cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: P.navy }}>{r.name}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, Consolas, monospace' }}>{r.phone || 'N/A'}</td>
                    <td style={td}>{r.agent}</td>
                    <td style={td}>{r.verticalType ?? 'N/A'}</td>
                    <td style={td}>{fmtDay(r.saleDate)}</td>
                    <td style={{ ...td, color: P.slate }}>{r.saleTimeEst ?? 'N/A'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {confirm && (
        <Confirm tone={RED} title={`Reject ${picked.size} Sale${picked.size === 1 ? '' : 's'}`} busy={busy} okLabel="Confirm Final Reject" onOk={reject} onCancel={() => setConfirm(false)}>
          <p style={{ margin: 0 }}>
            <b style={{ color: P.navy }}>{picked.size}</b> sale{picked.size === 1 ? '' : 's'} of <b style={{ color: P.navy }}>{client?.companyName}</b> will be marked <b style={{ color: RED }}>Final Rejected</b>.
          </p>
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontWeight: 600 }}>Reason: Rejected by Client</div>
        </Confirm>
      )}
    </BatchShell>
  )
}
