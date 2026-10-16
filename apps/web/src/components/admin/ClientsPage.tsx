'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { CAMPAIGNS, STANDARD_FIELD_KEYS } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { apiGet, apiPost, apiPut, errMsg, errFields } from '@/lib/api'
import type { Client, FormField, Page } from '@/types'

const CORE_KEYS = new Set(STANDARD_FIELD_KEYS.client)
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const CAMPAIGN_BADGE: Record<string, string> = {
  Medicare: 'bg-blue-100 text-blue-700', 'Final Expense': 'bg-purple-100 text-purple-700', ACA: 'bg-emerald-100 text-emerald-700',
}
const inputCls  = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400'

type Form = {
  companyName: string; campaign: string; didCode: string; saleType: string; rateType: string
  rateOfSaleAmount: string; openingBalance: string; cycleOfDay: string; billingStartAfterDays: string; notes: string
}
const EMPTY: Form = { companyName: '', campaign: '', didCode: '', saleType: '', rateType: 'fixed', rateOfSaleAmount: '', openingBalance: '', cycleOfDay: '', billingStartAfterDays: '', notes: '' }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-xl'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function ExtraField({ field, value, onChange }: { field: FormField; value: string; onChange: (k: string, v: string) => void }) {
  const handle = (e: React.ChangeEvent<any>) => onChange(field.fieldKey, e.target.value)
  let input: React.ReactNode
  switch (field.fieldType) {
    case 'date':     input = <DateInput value={value} onChange={handle} className={inputCls} />; break
    case 'number':   input = <input type="number" value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={inputCls} />; break
    case 'textarea': input = <textarea value={value} onChange={handle} rows={field.textareaRows || 3} placeholder={field.placeholder ?? ''} className={`${inputCls} resize-none`} />; break
    case 'select':
      input = (
        <StyledSelect value={value} onChange={v => onChange(field.fieldKey, v)} placeholder="Select"
          options={[{ value: '', label: 'Select' }, ...(field.options ?? []).map(o => ({ value: o, label: o }))]} />
      )
      break
    case 'amount_usd':
    case 'amount_pkr':
      input = (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold select-none">{field.fieldType === 'amount_usd' ? '$' : '₨'}</span>
          <input type="number" value={value} onChange={handle} placeholder={field.placeholder ?? '0.00'} className={`${inputCls} pl-7`} />
        </div>
      )
      break
    default: input = <input type="text" value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={inputCls} />
  }
  return <div style={{ gridColumn: `span ${COL_SPAN[field.colSpan] ?? 3}` }}><Field label={field.label} required={field.isRequired}>{input}</Field></div>
}

function ClientForm({ initial, onSubmit, loading, errors }: { initial?: Client; onSubmit: (p: Record<string, unknown>) => void; loading: boolean; errors: Record<string, string[]> }) {
  const isEdit = !!initial
  const [form, setForm] = useState<Form>(initial ? {
    companyName: initial.companyName, campaign: str(initial.campaign), didCode: str(initial.didCode), saleType: str(initial.saleType),
    rateType: initial.rateType, rateOfSaleAmount: str(initial.rateOfSaleAmount), openingBalance: str(initial.openingBalance),
    cycleOfDay: str(initial.cycleOfDay), billingStartAfterDays: str(initial.billingStartAfterDays), notes: str(initial.notes),
  } : EMPTY)
  const [extra, setExtra] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial?.extraFields ?? {}).map(([k, v]) => [k, str(v)])))
  const [dids, setDids] = useState<{ id: string; didCode: string }[]>([])
  const [didsLoading, setDidsLoading] = useState(false)
  const [fields, setFields] = useState<FormField[]>([])

  useEffect(() => { apiGet<FormField[]>('/crm/form-fields/public', { formType: 'client' }).then(setFields).catch(() => {}) }, [])

  const cfg = (key: string) => fields.find(f => f.fieldKey === key)
  const vis = (key: string) => fields.length === 0 || !!cfg(key)
  const label = (key: string, fb: string) => cfg(key)?.label ?? fb
  const req = (key: string, fb = false) => cfg(key)?.isRequired ?? fb
  const ph = (key: string, fb = '') => cfg(key)?.placeholder ?? fb
  const customFields = useMemo(() => fields.filter(f => !CORE_KEYS.has(f.fieldKey)), [fields])
  const err = (k: string) => errors[k]?.[0]
  const set = (name: keyof Form, value: string) => setForm(p => ({ ...p, [name]: value }))

  useEffect(() => {
    if (!form.campaign) { setDids([]); return }
    setDidsLoading(true)
    apiGet<{ id: string; didCode: string }[]>('/clients/available-dids', { campaign: form.campaign, currentDid: isEdit ? initial?.didCode : undefined })
      .then(setDids).catch(() => setDids([])).finally(() => setDidsLoading(false))
  }, [form.campaign]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
    payload.extraFields = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== ''))
    onSubmit(payload)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {vis('company_name') && (
        <Field label={label('company_name', 'Company Name')} required error={err('companyName')}>
          <input value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder={ph('company_name', 'e.g. Acme Insurance Co.')} required className={inputCls} />
        </Field>
      )}
      {vis('campaign') && (
        <Field label={label('campaign', 'Campaign')} required>
          <StyledSelect value={form.campaign} onChange={v => setForm(p => ({ ...p, campaign: v, didCode: '' }))} required placeholder="Select campaign"
            options={CAMPAIGNS.map(c => ({ value: c, label: c }))} />
        </Field>
      )}
      {vis('did_code') && (
        <Field label={label('did_code', 'Assign DID')}>
          <StyledSelect value={form.didCode} onChange={v => set('didCode', v)} disabled={!form.campaign} loading={didsLoading}
            placeholder={!form.campaign ? 'Select a campaign first' : 'No DID assigned'}
            options={[{ value: '', label: 'No DID assigned' }, ...dids.map(d => ({ value: d.didCode, label: d.didCode }))]} />
          {form.campaign && !didsLoading && dids.length === 0 && <p className="mt-1 text-xs text-amber-600">No available DIDs for {form.campaign}.</p>}
        </Field>
      )}
      {vis('sale_type') && (
        <Field label={label('sale_type', 'Sale Type')} required>
          <StyledSelect value={form.saleType} onChange={v => set('saleType', v)} required placeholder="Select type"
            options={[{ value: 'CPA', label: 'CPA' }, { value: 'CPL', label: 'CPL' }]} />
        </Field>
      )}
      {vis('opening_balance') && (
        <Field label={label('opening_balance', 'Opening Balance (USD)')}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold select-none">$</span>
            <input type="number" min="0" step="0.01" value={form.openingBalance} onChange={e => set('openingBalance', e.target.value)} placeholder={ph('opening_balance', '0.00')} className={`${inputCls} pl-7`} />
          </div>
          <p className="mt-1 text-xs text-gray-400">Enter the existing balance for clients being migrated.</p>
        </Field>
      )}
      {vis('rate_type') && (
        <Field label={label('rate_type', 'Rate Type')} required>
          <div className="flex gap-3">
            {['fixed', 'variable'].map(type => (
              <button key={type} type="button" onClick={() => setForm(p => ({ ...p, rateType: type, rateOfSaleAmount: type === 'variable' ? '' : p.rateOfSaleAmount }))}
                className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${form.rateType === type ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {type === 'fixed' ? 'Fixed' : 'Variable'}
              </button>
            ))}
          </div>
        </Field>
      )}
      {vis('rate_of_sale_amount') && form.rateType === 'fixed' && (
        <Field label={label('rate_of_sale_amount', 'Rate Per Sale (USD)')} required>
          <input type="number" min="0" step="0.01" value={form.rateOfSaleAmount} onChange={e => set('rateOfSaleAmount', e.target.value)} placeholder={ph('rate_of_sale_amount', '0.00')} required className={inputCls} />
        </Field>
      )}
      {form.rateType === 'variable' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">Variable rate: the actual rate is entered per sale at final approval.</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {vis('cycle_of_day') && (
          <Field label={label('cycle_of_day', 'Cycle (Days)')} required>
            <input type="number" min="1" value={form.cycleOfDay} onChange={e => set('cycleOfDay', e.target.value)} placeholder={ph('cycle_of_day', 'e.g. 30')} required className={inputCls} />
            <p className="mt-1 text-xs text-gray-400">Invoices are generated for each completed cycle.</p>
          </Field>
        )}
        {vis('billing_start_after_days') && (
          <Field label={label('billing_start_after_days', 'Billing Starts After (Days)')} required>
            <input type="number" min="0" value={form.billingStartAfterDays} onChange={e => set('billingStartAfterDays', e.target.value)} placeholder={ph('billing_start_after_days', 'e.g. 0')} required className={inputCls} />
          </Field>
        )}
      </div>
      {vis('notes') && (
        <Field label={label('notes', 'Notes')}>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={cfg('notes')?.textareaRows ?? 3} placeholder={ph('notes', 'Optional notes')} className={`${inputCls} resize-none`} />
        </Field>
      )}
      {customFields.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {customFields.map(f => <ExtraField key={f.fieldKey} field={f} value={extra[f.fieldKey] ?? ''} onChange={(k, v) => setExtra(p => ({ ...p, [k]: v }))} />)}
        </div>
      )}
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-60">
          {loading ? 'Saving' : isEdit ? 'Save Changes' : 'Create Client'}
        </button>
      </div>
    </form>
  )
}

function DidPoolModal({ onClose, setToast }: { onClose: () => void; setToast: (t: { message: string; type: 'success' | 'error' }) => void }) {
  const [rows, setRows] = useState<{ id: string; didCode: string; campaign: string; isActive: boolean; assignedTo: string | null }[]>([])
  const [code, setCode] = useState('')
  const [campaign, setCampaign] = useState<string>(CAMPAIGNS[0])
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { apiGet('/dids').then(setRows).catch(() => setRows([])) }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await apiPost('/dids', { didCode: code, campaign })
      setCode(''); load()
      setToast({ message: 'DID added.', type: 'success' })
    } catch (err) {
      setToast({ message: errMsg(err, 'Failed to add DID.'), type: 'error' })
    } finally { setBusy(false) }
  }
  const toggle = async (id: string) => {
    try { await apiPost(`/dids/${id}/toggle-active`); load() } catch (err) { setToast({ message: errMsg(err, 'Failed to update DID.'), type: 'error' }) }
  }

  return (
    <Modal title="DID Pool" onClose={onClose} wide>
      <form onSubmit={add} className="flex items-end gap-3 mb-4">
        <div className="flex-1"><Field label="DID Code" required><input value={code} onChange={e => setCode(e.target.value)} required maxLength={10} placeholder="e.g. MD21" className={inputCls} /></Field></div>
        <div className="w-48"><Field label="Campaign" required>
          <StyledSelect value={campaign} onChange={setCampaign} options={CAMPAIGNS.map(c => ({ value: c, label: c }))} />
        </Field></div>
        <button type="submit" disabled={busy} className="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Add</button>
      </form>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>{['DID', 'Campaign', 'Assigned To', 'Status', ''].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(d => (
              <tr key={d.id} className={d.isActive ? '' : 'opacity-50'}>
                <td className="px-3 py-2 font-mono font-semibold">{d.didCode}</td>
                <td className="px-3 py-2 text-xs">{d.campaign}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{d.assignedTo ?? 'Available'}</td>
                <td className="px-3 py-2 text-xs">{d.isActive ? 'Active' : 'Inactive'}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => toggle(d.id)} disabled={!!d.assignedTo && d.isActive} title={d.assignedTo && d.isActive ? 'Unassign it from the client first' : ''}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:text-gray-300">{d.isActive ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

export default function ClientsPage() {
  const [data, setData]         = useState<Page<Client> | null>(null)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [campaignFilter, setCampaignFilter] = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<Client | null>(null)
  const [showPool, setShowPool] = useState(false)
  const [busy, setBusy]         = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({})
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    try {
      setData(await apiGet<Page<Client>>('/clients', { page, search, campaign: campaignFilter, status: statusFilter }))
    } catch {
      setToast({ message: 'Failed to load clients.', type: 'error' })
    } finally { setLoading(false) }
  }, [page, search, campaignFilter, statusFilter])

  useEffect(() => { fetchClients() }, [fetchClients])

  const save = async (payload: Record<string, unknown>) => {
    setBusy(true); setFormErrors({})
    try {
      if (editClient) await apiPut(`/clients/${editClient.id}`, payload)
      else await apiPost('/clients', payload)
      setToast({ message: editClient ? 'Client updated successfully.' : 'Client created successfully.', type: 'success' })
      setEditClient(null); setShowCreate(false)
      fetchClients()
    } catch (e) {
      setFormErrors(errFields(e))
      setToast({ message: errMsg(e, 'Failed to save client.'), type: 'error' })
    } finally { setBusy(false) }
  }

  const toggleActive = async () => {
    const c = confirmToggle
    setConfirmToggle(null)
    if (!c) return
    try {
      await apiPost(`/clients/${c.id}/toggle-active`)
      setToast({ message: `${c.companyName} ${c.isActive ? 'deactivated' : 'activated'}.`, type: 'success' })
      fetchClients()
    } catch (e) {
      setToast({ message: errMsg(e, 'Failed to update client status.'), type: 'error' })
    }
  }

  const clients = data?.data ?? []
  const from = data ? (data.currentPage - 1) * data.perPage + 1 : 0
  const pill = (active: boolean): React.CSSProperties => active
    ? { background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)', color: '#fff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }
    : { background: 'transparent', color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif" }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {showCreate && <Modal title="New Client" onClose={() => { setShowCreate(false); setFormErrors({}) }}><ClientForm onSubmit={save} loading={busy} errors={formErrors} /></Modal>}
      {editClient && <Modal title={`Edit Client: ${editClient.companyName}`} onClose={() => { setEditClient(null); setFormErrors({}) }}><ClientForm initial={editClient} onSubmit={save} loading={busy} errors={formErrors} /></Modal>}
      {showPool && <DidPoolModal onClose={() => setShowPool(false)} setToast={setToast} />}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmToggle(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-sm text-gray-700 mb-5">
              {confirmToggle.isActive ? 'Deactivate' : 'Activate'} client &quot;{confirmToggle.companyName}&quot;?{' '}
              {confirmToggle.isActive && confirmToggle.didCode ? `DID ${confirmToggle.didCode} will become available again.` : ''}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmToggle(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={toggleActive} className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4" style={{ background: '#EDF0F3', minHeight: '100vh' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ color: '#132E57', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>Client Management</h1>
            <p className="text-sm mt-0.5" style={{ color: '#5C5C5C' }}>Manage real clients and their DID assignments</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPool(true)} className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background: 'rgba(19,46,87,0.08)', color: '#132E57', border: '1px solid rgba(19,46,87,0.2)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>DID Pool</button>
            <button onClick={() => { setShowCreate(true); setFormErrors({}) }} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all"
              style={{ background: 'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)', color: '#ffffff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>+ New Client</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5 shadow-sm" style={{ background: 'linear-gradient(135deg, #0E5F6E 0%, #1E8496 100%)', border: '1px solid #1A7888' }}>
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.15)' }}>
            {[{ label: 'All', value: '' }, ...CAMPAIGNS.map(c => ({ label: c, value: c }))].map(({ label, value }) => (
              <button key={value} onClick={() => { setCampaignFilter(value); setPage(1) }} className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all" style={pill(campaignFilter === value)}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.15)' }}>
            {[{ label: 'All', value: '' }, { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }].map(({ label, value }) => (
              <button key={value} onClick={() => { setStatusFilter(value); setPage(1) }} className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all" style={pill(statusFilter === value)}>{label}</button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); setPage(1); setSearch(searchInput) }} className="flex gap-2 ml-auto">
            <input type="text" placeholder="Search company or DID" value={searchInput} onChange={e => setSearchInput(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs outline-none transition w-48 placeholder-white/70" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }} />
            <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all" style={{ background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)', color: '#fff', fontFamily: "'Rajdhani', sans-serif" }}>Search</button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ background: 'linear-gradient(90deg, #4A5568 0%, #5A6880 100%)' }}>
                  {['Company', 'Campaign', 'Assigned DID', 'Type', 'Rate Type', 'Rate', 'Opening Bal.', 'Cycle', 'Status'].map(h => (
                    <th key={h} className="px-5 py-3 text-xs font-bold uppercase" style={{ color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                  <th className="px-5 py-3 text-xs font-bold uppercase text-right" style={{ color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.07em' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 10 }).map((__, j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>)}</tr>
                )) : clients.length === 0 ? (
                  <tr><td colSpan={10} className="px-5 py-12 text-center text-sm text-gray-400">No clients found. Click + New Client to add one.</td></tr>
                ) : clients.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${!c.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5 font-medium text-gray-800">{c.companyName}</td>
                    <td className="px-5 py-3.5"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CAMPAIGN_BADGE[c.campaign ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>{c.campaign ?? 'N/A'}</span></td>
                    <td className="px-5 py-3.5">{c.didCode ? <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{c.didCode}</span> : <span className="text-gray-400 text-xs">N/A</span>}</td>
                    <td className="px-5 py-3.5">{c.saleType ? <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${c.saleType === 'CPA' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'}`}>{c.saleType}</span> : <span className="text-gray-400 text-xs">N/A</span>}</td>
                    <td className="px-5 py-3.5"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.rateType === 'fixed' ? 'bg-slate-100 text-slate-700' : 'bg-orange-100 text-orange-700'}`}>{c.rateType === 'fixed' ? 'Fixed' : 'Variable'}</span></td>
                    <td className="px-5 py-3.5">{c.rateType === 'fixed' && c.rateOfSaleAmount != null ? <span className="text-gray-600 text-xs font-mono">${Number(c.rateOfSaleAmount).toLocaleString()}</span> : <span className="text-gray-400 text-xs">N/A</span>}</td>
                    <td className="px-5 py-3.5">{c.openingBalance != null && Number(c.openingBalance) > 0 ? <span className="text-emerald-700 text-xs font-mono font-semibold">${Number(c.openingBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> : <span className="text-gray-400 text-xs">N/A</span>}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">{c.cycleOfDay ? `${c.cycleOfDay}d` : 'N/A'}</td>
                    <td className="px-5 py-3.5"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditClient(c); setFormErrors({}) }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                        </button>
                        <button onClick={() => setConfirmToggle(c)} title={c.isActive ? 'Deactivate' : 'Activate'}
                          className={`p-1.5 rounded-lg transition-colors ${c.isActive ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d={c.isActive ? 'M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'} />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.lastPage > 1 && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">Showing {from} to {from + clients.length - 1} of {data.total} clients</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={data.currentPage === 1} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">Previous</button>
                <button onClick={() => setPage(p => Math.min(data.lastPage, p + 1))} disabled={data.currentPage === data.lastPage} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
