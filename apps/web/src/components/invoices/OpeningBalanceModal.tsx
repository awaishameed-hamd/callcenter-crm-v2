'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import StyledSelect from '@/components/ui/StyledSelect'
import { NAVY, TEAL, F, inputStyle, labelStyle, btn } from './invoiceShared'

type Line = { id: string; lineName: string; didCode: string | null; openingBalance: string | null; openingBalanceDate: string | null }

const ymd = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10))

// What a line already owed before its account was kept here (the opening balance stays on the
// line, as before clients had lines). It shows on the client's ledger as an Opening Balance
// invoice and is settled through Receive Payment like any other. A client with several lines
// picks the line first.
export default function OpeningBalanceModal({ client, mode, onClose, onSaved }: { client: any; mode: 'add' | 'edit'; onClose: () => void; onSaved: () => void }) {
  const [lines,  setLines]  = useState<Line[]>([])
  const [lineId, setLineId] = useState('')
  const [value,  setValue]  = useState('')
  const [date,   setDate]   = useState(ymd(null))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const pick = (l: Line | undefined) => {
    setLineId(l?.id ?? '')
    setValue(mode === 'edit' && l ? String(Number(l.openingBalance ?? 0)) : '')
    setDate(ymd(l?.openingBalanceDate))
  }

  useEffect(() => {
    api.get('/clients', { params: { perPage: 'all', companyId: client.id } })
      .then(({ data }) => {
        const all = (data?.data ?? data) as Line[]
        setLines(all)
        if (all.length === 1) pick(all[0])
      })
      .catch(() => setError('Could not load the lines of this client.'))
  }, [client.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!lineId) { setError('Pick the line first.'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/invoices/opening-balance/${lineId}`, { openingBalance: Number(value) || 0, date })
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  const many = lines.length > 1
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900, color: NAVY, fontFamily: F }}>
          {mode === 'add' ? 'Add Opening Balance' : 'Edit Opening Balance'}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: P.textMuted, fontFamily: F }}>
          What {many ? 'a line of ' : ''}{client.businessName ?? client.fullName} already owed before its account was kept here.
        </p>
        {many && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Line</label>
            <StyledSelect value={lineId} onChange={v => pick(lines.find(l => l.id === v))} placeholder="Select line"
              options={lines.map(l => ({ value: l.id, label: `${l.lineName}${l.didCode ? ` (${l.didCode})` : ''}${Number(l.openingBalance ?? 0) > 0 ? `, $${Number(l.openingBalance).toFixed(2)}` : ''}` }))} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount (USD)</label>
            <input type="number" min={0} step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder="0.00" style={inputStyle} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>As of</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={{ ...btn('#fff', '#475569'), border: `1px solid ${P.border}` }}>Cancel</button>
          <button onClick={save} disabled={saving || !lineId} style={{ ...btn(TEAL), opacity: saving || !lineId ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
