'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import DataTable, { Column } from '@/components/ui/DataTable'
import StyledSelect from '@/components/ui/StyledSelect'

interface Client { id: string; companyName: string; dids: DID[] }
interface DID    { id: string; didCode: string; campaign: string; clientId: string; isActive: boolean; client?: { companyName: string } }

const CAMPAIGN_OPTS = [
  { value: 'Medicare',      label: 'Medicare' },
  { value: 'Final Expense', label: 'Final Expense' },
  { value: 'ACA',           label: 'ACA' },
  { value: 'Other',         label: 'Other' },
]

export default function DidsPage() {
  const [dids,    setDids]    = useState<DID[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'dids' | 'clients'>('dids')
  const [modal,   setModal]   = useState<'did' | 'client' | null>(null)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [didForm, setDidForm] = useState({ didCode: '', campaign: '', clientId: '' })
  const [clientName, setClientName] = useState('')
  const [didErrors, setDidErrors] = useState<Record<string, string>>({})

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: d }, { data: c }] = await Promise.all([api.get('/dids'), api.get('/dids/clients')])
      setDids(d?.data ?? d ?? [])
      setClients(c?.data ?? c ?? [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreateDid = async () => {
    const e: Record<string, string> = {}
    if (!didForm.didCode.trim()) e.didCode   = 'Required'
    if (!didForm.campaign)       e.campaign  = 'Required'
    if (!didForm.clientId)       e.clientId  = 'Required'
    setDidErrors(e)
    if (Object.keys(e).length > 0) return
    setSaving(true)
    try {
      await api.post('/dids', didForm)
      showToast('DID created.', true)
      setModal(null)
      setDidForm({ didCode: '', campaign: '', clientId: '' })
      load()
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Error', false) }
    finally { setSaving(false) }
  }

  const handleCreateClient = async () => {
    if (!clientName.trim()) return
    setSaving(true)
    try {
      await api.post('/dids/clients', { companyName: clientName.trim() })
      showToast('Client created.', true)
      setModal(null)
      setClientName('')
      load()
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Error', false) }
    finally { setSaving(false) }
  }

  const handleToggleDid = async (did: DID) => {
    try {
      await api.put(`/dids/${did.id}`, { isActive: !did.isActive })
      showToast(did.isActive ? 'DID deactivated.' : 'DID activated.', true)
      load()
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Error', false) }
  }

  const clientOpts = clients.map(c => ({ value: c.id, label: c.companyName }))

  const didColumns: Column<DID>[] = [
    { key: 'didCode',   label: 'DID Code',  width: 130, render: r => <span style={{ fontWeight: 700, color: P.navy }}>{r.didCode}</span> },
    { key: 'campaign',  label: 'Campaign',  width: 130 },
    { key: 'client',    label: 'Company',   width: 180, render: r => r.client?.companyName ?? '' },
    {
      key: 'isActive', label: 'Status', width: 90,
      render: r => (
        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: r.isActive ? '#D1FAE5' : '#FEE2E2', color: r.isActive ? '#065F46' : '#991B1B' }}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions', label: 'Actions', width: 110, resizable: false,
      render: r => (
        <button onClick={() => handleToggleDid(r)}
          style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: r.isActive ? '#FEE2E2' : '#D1FAE5', color: r.isActive ? '#991B1B' : '#065F46', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
          {r.isActive ? 'Deactivate' : 'Activate'}
        </button>
      ),
    },
  ]

  const clientColumns: Column<Client>[] = [
    { key: 'companyName', label: 'Company Name', width: 250 },
    { key: 'dids',        label: 'DID Count',    width: 110, render: r => String(r.dids.length) },
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: `1.5px solid ${P.border}`, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: P.navy,
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }
  const errStyle: React.CSSProperties   = { fontSize: 11, color: '#D62828', marginTop: 3 }

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? '#065F46' : '#991B1B', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{toast.msg}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>DIDs & Clients</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setModal('client'); setClientName('') }}
            style={{ padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${P.navy}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            + Add Client
          </button>
          <button onClick={() => { setModal('did'); setDidForm({ didCode: '', campaign: '', clientId: '' }); setDidErrors({}) }}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            + Add DID
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${P.border}`, marginBottom: 16, width: 'fit-content' }}>
        {(['dids', 'clients'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '7px 20px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Inter',sans-serif", background: tab === t ? P.navy : '#fff', color: tab === t ? '#fff' : P.navy }}>
            {t === 'dids' ? 'DIDs' : 'Clients'}
          </button>
        ))}
      </div>

      {tab === 'dids'
        ? <DataTable id="dids" columns={didColumns} rows={dids} loading={loading} rowKey={r => r.id} minWidth={600} />
        : <DataTable id="clients" columns={clientColumns} rows={clients} loading={loading} rowKey={r => r.id} minWidth={400} />
      }

      {/* Add DID modal */}
      {modal === 'did' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', width: 380, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 700, color: P.navy, margin: 0 }}>Add DID</h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: P.textMuted }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>DID Code *</label>
                <input value={didForm.didCode} onChange={e => setDidForm(f => ({ ...f, didCode: e.target.value }))} placeholder="e.g. D001"
                  style={{ ...inputStyle, borderColor: didErrors.didCode ? '#D62828' : P.border }} />
                {didErrors.didCode && <div style={errStyle}>{didErrors.didCode}</div>}
              </div>
              <div>
                <label style={labelStyle}>Campaign *</label>
                <StyledSelect value={didForm.campaign} onChange={v => setDidForm(f => ({ ...f, campaign: v }))} options={CAMPAIGN_OPTS} placeholder="Select campaign"
                  borderColor={didErrors.campaign ? '#D62828' : undefined} />
                {didErrors.campaign && <div style={errStyle}>{didErrors.campaign}</div>}
              </div>
              <div>
                <label style={labelStyle}>Company *</label>
                <StyledSelect value={didForm.clientId} onChange={v => setDidForm(f => ({ ...f, clientId: v }))} options={clientOpts} placeholder="Select company"
                  borderColor={didErrors.clientId ? '#D62828' : undefined} />
                {didErrors.clientId && <div style={errStyle}>{didErrors.clientId}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Cancel</button>
              <button onClick={handleCreateDid} disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Creating…' : 'Create DID'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Client modal */}
      {modal === 'client' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', width: 340, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 700, color: P.navy, margin: 0 }}>Add Client</h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: P.textMuted }}>✕</button>
            </div>
            <label style={labelStyle}>Company Name *</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Acme Insurance" style={inputStyle} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button onClick={() => setModal(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Cancel</button>
              <button onClick={handleCreateClient} disabled={saving || !clientName.trim()}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: saving || !clientName.trim() ? 0.6 : 1 }}>
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
