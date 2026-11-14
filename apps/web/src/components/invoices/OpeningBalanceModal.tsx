'use client'

import { useState } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { NAVY, TEAL, F, inputStyle, labelStyle, btn } from './invoiceShared'

// What the client already owed before its account was kept here. It shows in the ledger as an
// Opening Balance invoice and is settled through Receive Payment like any other.
export default function OpeningBalanceModal({ client, mode, onClose, onSaved }: { client: any; mode: 'add' | 'edit'; onClose: () => void; onSaved: () => void }) {
  const [value,  setValue]  = useState(mode === 'edit' ? String(Number(client.openingBalance ?? 0)) : '')
  const [date,   setDate]   = useState(client.openingBalanceDate ? String(client.openingBalanceDate).slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      await api.patch(`/invoices/opening-balance/${client.id}`, { openingBalance: Number(value) || 0, date })
      onSaved()
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900, color: NAVY, fontFamily: F }}>
          {mode === 'add' ? 'Add Opening Balance' : 'Edit Opening Balance'}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: P.textMuted, fontFamily: F }}>
          What {client.businessName ?? client.fullName} already owed before their account was kept here.
        </p>
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
          <button onClick={save} disabled={saving} style={{ ...btn(TEAL), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
