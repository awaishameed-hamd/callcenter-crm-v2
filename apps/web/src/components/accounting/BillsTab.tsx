// @ts-nocheck
'use client'

// Bills & Suppliers.

import { useState, useEffect, useCallback } from 'react'
import api from './accApi'
import { P, SectionHeader, Btn, Input, Modal, EmptyState, Th, Td, THEAD_STYLE } from './shared'
// ══════════════════════════════════════════════════════════════════════════════
// MODULE 3: BILLS & SUPPLIERS
// ══════════════════════════════════════════════════════════════════════════════

export function BillsTab() {
  const [tab, setTab]       = useState('unpaid')
  const [bills, setBills]   = useState([])
  const [loading, setLoading] = useState(true)
  const [parties, setParties] = useState([])
  const [showPartyModal, setShowPartyModal] = useState(false)
  const [partyForm, setPartyForm] = useState({ name: '', type: 'supplier', email: '', phone: '', address: '', tax_number: '' })
  const [savingParty, setSavingParty] = useState(false)

  const fetchBills = useCallback(async () => {
    setLoading(true)
    try {
      const statusMap = { unpaid: 'posted', paid: 'reversed', review: 'draft' }
      const r = await api.get('/accounting/vouchers', { params: { type: 'BILL', status: statusMap[tab] ?? 'posted', per_page: 100 } })
      setBills(r.data.data ?? [])
    } finally { setLoading(false) }
  }, [tab])

  useEffect(() => { fetchBills() }, [fetchBills])
  useEffect(() => {
    api.get('/accounting/parties', { params: { type: 'supplier' } }).then(r => setParties(r.data.data))
  }, [])

  const saveParty = async (e) => {
    e.preventDefault(); setSavingParty(true)
    try {
      await api.post('/accounting/parties', partyForm)
      setShowPartyModal(false)
      api.get('/accounting/parties', { params: { type: 'supplier' } }).then(r => setParties(r.data.data))
    } finally { setSavingParty(false) }
  }

  return (
    <div>
      <SectionHeader title="Bills & Suppliers"
        action={<Btn onClick={() => setShowPartyModal(true)}>+ Add Supplier</Btn>} />

      {/* Suppliers list */}
      <div className="mb-5 bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <div className="px-4 py-3" style={{ background: `linear-gradient(90deg, ${P.navyGr}, ${P.tealDk})` }}>
          <span className="text-white font-black text-xs" style={{ fontFamily: "'Aptos', sans-serif" }}>SUPPLIERS ({parties.length})</span>
        </div>
        <div className="flex flex-wrap gap-3 p-4">
          {parties.length === 0
            ? <p className="text-xs" style={{ color: P.muted }}>No suppliers added yet.</p>
            : parties.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs" style={{ borderColor: P.border }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-xs" style={{ background: P.tealGr }}>
                  {p.name[0]}
                </div>
                <div>
                  <div className="font-bold" style={{ color: P.navyGr }}>{p.name}</div>
                  {p.email && <div style={{ color: P.muted }}>{p.email}</div>}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Bills tabs */}
      <div className="flex gap-1 mb-4">
        {['unpaid', 'paid', 'review'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-xs font-black capitalize transition-all"
            style={tab === t ? { background: P.tealGr, color: '#fff' } : { background: P.white, color: P.tealGr, border: `1px solid ${P.tealGr}` }}>
            {t === 'review' ? 'For Review' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: P.border }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={THEAD_STYLE}>
              <Th>Bill #</Th><Th>Supplier</Th><Th>Date</Th><Th>Reference</Th><Th>Memo</Th><Th right>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={6}><EmptyState msg="Loading…" /></td></tr>
              : bills.length === 0
              ? <tr><td colSpan={6}><EmptyState msg="No bills found." /></td></tr>
              : bills.map((b, i) => (
                <tr key={b.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                  <Td mono bold>{b.voucher_number}</Td>
                  <Td>{b.party?.name ?? ''}</Td>
                  <Td>{b.date}</Td>
                  <Td muted>{b.reference_number ?? ''}</Td>
                  <Td muted>{b.memo ?? ''}</Td>
                  <Td right>
                    <span className="px-2 py-0.5 rounded text-xs font-bold capitalize"
                      style={{ background: b.status === 'posted' ? '#FFF8E1' : '#E8F5E9', color: b.status === 'posted' ? P.amber : P.tealGr }}>
                      {b.status === 'posted' ? 'Unpaid' : 'Paid'}
                    </span>
                  </Td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      <Modal open={showPartyModal} onClose={() => setShowPartyModal(false)} title="Add Supplier" width="max-w-lg">
        <form onSubmit={saveParty} className="space-y-3">
          <Input label="Supplier Name" value={partyForm.name} onChange={v => setPartyForm(p => ({ ...p, name: v }))} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" value={partyForm.email} onChange={v => setPartyForm(p => ({ ...p, email: v }))} />
            <Input label="Phone" value={partyForm.phone} onChange={v => setPartyForm(p => ({ ...p, phone: v }))} />
          </div>
          <Input label="Tax / NTN Number" value={partyForm.tax_number} onChange={v => setPartyForm(p => ({ ...p, tax_number: v }))} />
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: P.navyGr }}>Address</label>
            <textarea value={partyForm.address} onChange={e => setPartyForm(p => ({ ...p, address: e.target.value }))} rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none" style={{ borderColor: P.border }} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={() => setShowPartyModal(false)}>Cancel</Btn>
            <Btn type="submit" disabled={savingParty}>{savingParty ? 'Saving…' : 'Add Supplier'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
