'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { STANDARD_FIELD_KEYS } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import DataTable, { type Column } from '@/components/ui/DataTable'
import { PageShell, PageHeader, FilterBar, FilterSep, FilterPills, FilterSearch, FilterCount, PrimaryButton, SecondaryButton, PlusIcon, Pager } from '@/components/ui/PageChrome'
import { P } from '@/lib/palette'
import { useVerticals, campaignsOf, colorOf, verticalBadgeStyle } from '@/lib/verticals'
import VerticalsManager from './VerticalsManager'
import { apiGet, apiPost, apiPut, errMsg, errFields } from '@/lib/api'
import type { Client, FormField, Page } from '@/types'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const CORE_KEYS = new Set(STANDARD_FIELD_KEYS.client)
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
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
  const { verticals } = useVerticals()
  const campaignOptions = [...campaignsOf(verticals).map(v => v.name), ...(initial?.campaign && !campaignsOf(verticals).some(v => v.name === initial.campaign) ? [initial.campaign] : [])]
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
            options={campaignOptions.map(c => ({ value: c, label: c }))} />
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
  const { verticals } = useVerticals()
  const [campaign, setCampaign] = useState<string>('')
  useEffect(() => { if (!campaign && campaignsOf(verticals)[0]) setCampaign(campaignsOf(verticals)[0].name) }, [verticals, campaign])
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
          <StyledSelect value={campaign} onChange={setCampaign} options={campaignsOf(verticals).map(c => ({ value: c.name, label: c.name }))} />
        </Field></div>
        <button type="submit" disabled={busy} className="px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Add</button>
      </form>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr style={{ background: '#F2AC18' }}>{['DID', 'Campaign', 'Assigned To', 'Status', ''].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-900">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(d => (
              <tr key={d.id} className={d.isActive ? '' : 'opacity-50'}>
                <td className="px-3 py-2 font-mono font-semibold">{d.didCode}</td>
                <td className="px-3 py-2 text-xs"><span style={verticalBadgeStyle(colorOf(verticals, d.campaign))}>{d.campaign}</span></td>
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
  const [showVerticals, setShowVerticals] = useState(false)
  const { verticals, reload: reloadVerticals } = useVerticals()
  const [busy, setBusy]         = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({})
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchClients = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setData(await apiGet<Page<Client>>('/clients', { page, search, campaign: campaignFilter, status: statusFilter }))
    } catch {
      if (!silent) setToast({ message: 'Failed to load clients.', type: 'error' })
    } finally { if (!silent) setLoading(false) }
  }, [page, search, campaignFilter, statusFilter])

  useEffect(() => { fetchClients() }, [fetchClients])
  useAutoRefresh(() => fetchClients(true))

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
  const na = <span style={{ fontSize: 12, color: '#9CA3AF' }}>N/A</span>
  const tw = (cls: string, text: React.ReactNode) => <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{text}</span>
  const iconBtn = (title: string, onClick: () => void, hover: string, d: string) => (
    <button onClick={e => { e.stopPropagation(); onClick() }} title={title}
      style={{ padding: 6, borderRadius: 8, border: 0, background: 'transparent', color: '#9CA3AF', cursor: 'pointer', display: 'flex' }}
      onMouseEnter={e => { e.currentTarget.style.color = hover; e.currentTarget.style.background = `${hover}14` }}
      onMouseLeave={e => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.background = 'transparent' }}>
      <svg width={14} height={14} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
    </button>
  )

  const columns: Column<Client>[] = [
    { key: 'company', label: 'Company', width: 210, render: c => <span style={{ fontWeight: 600, color: P.textHeading }}>{c.companyName}</span> },
    { key: 'campaign', label: 'Campaign', width: 130, render: c => c.campaign ? <span style={verticalBadgeStyle(colorOf(verticals, c.campaign))}>{c.campaign}</span> : na },
    { key: 'did', label: 'Assigned DID', width: 120, render: c => c.didCode ? <span style={{ fontSize: 12, fontWeight: 700, color: P.teal, letterSpacing: '0.04em' }}>{c.didCode}</span> : na },
    { key: 'type', label: 'Type', width: 90, render: c => c.saleType ? tw(c.saleType === 'CPA' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700', c.saleType) : na },
    { key: 'rateType', label: 'Rate Type', width: 100, render: c => <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.rateType === 'fixed' ? 'bg-slate-100 text-slate-700' : 'bg-orange-100 text-orange-700'}`}>{c.rateType === 'fixed' ? 'Fixed' : 'Variable'}</span> },
    { key: 'rate', label: 'Rate', width: 90, render: c => c.rateType === 'fixed' && c.rateOfSaleAmount != null ? <span style={{ fontSize: 12, color: P.slate }}>${Number(c.rateOfSaleAmount).toLocaleString()}</span> : na },
    { key: 'opening', label: 'Opening Bal.', width: 120, render: c => c.openingBalance != null && Number(c.openingBalance) > 0
      ? <span style={{ fontSize: 12, fontWeight: 600, color: P.forest }}>${Number(c.openingBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> : na },
    { key: 'cycle', label: 'Cycle', width: 80, render: c => <span style={{ fontSize: 12, color: P.slate }}>{c.cycleOfDay ? `${c.cycleOfDay}d` : 'N/A'}</span> },
    { key: 'status', label: 'Status', width: 100, render: c => tw(c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500', c.isActive ? 'Active' : 'Inactive') },
    { key: 'actions', label: 'Actions', width: 100, align: 'right', resizable: false, render: c => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
        {iconBtn('Edit', () => { setEditClient(c); setFormErrors({}) }, '#2563EB', 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931zm0 0L19.5 7.125')}
        {iconBtn(c.isActive ? 'Deactivate' : 'Activate', () => setConfirmToggle(c), c.isActive ? '#DC2626' : '#16A34A',
          c.isActive ? 'M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z')}
      </div>
    ) },
  ]

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {showCreate && <Modal title="New Client" onClose={() => { setShowCreate(false); setFormErrors({}) }}><ClientForm onSubmit={save} loading={busy} errors={formErrors} /></Modal>}
      {editClient && <Modal title={`Edit Client: ${editClient.companyName}`} onClose={() => { setEditClient(null); setFormErrors({}) }}><ClientForm initial={editClient} onSubmit={save} loading={busy} errors={formErrors} /></Modal>}
      {showPool && <DidPoolModal onClose={() => setShowPool(false)} setToast={setToast} />}
      {showVerticals && (
        <Modal title="Verticals" wide onClose={() => { setShowVerticals(false); reloadVerticals(); fetchClients() }}>
          <VerticalsManager />
        </Modal>
      )}
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

      <PageShell>
        <PageHeader title="Client Management" actions={<>
          <SecondaryButton onClick={() => setShowVerticals(true)}>Verticals</SecondaryButton>
          <SecondaryButton onClick={() => setShowPool(true)}>DID Pool</SecondaryButton>
          <PrimaryButton onClick={() => { setShowCreate(true); setFormErrors({}) }}><PlusIcon /> New Client</PrimaryButton>
        </>} />

        <FilterBar>
          <FilterPills value={campaignFilter} onChange={v => { setCampaignFilter(v); setPage(1) }}
            options={[{ value: '', label: 'All Campaigns' }, ...verticals.filter(v => !v.isOther).map(v => ({ value: v.name, label: v.name }))]} />
          <FilterSep />
          <FilterPills value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1) }}
            options={[['', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as const} />
          <FilterSep />
          <FilterSearch value={searchInput} onChange={setSearchInput} onEnter={() => { setPage(1); setSearch(searchInput.trim()) }} placeholder="Company or DID, then Enter" width={220} />
          {data && <FilterCount>{data.total} client{data.total !== 1 ? 's' : ''}</FilterCount>}
        </FilterBar>

        <DataTable<Client>
          id="clients"
          rows={clients}
          loading={loading}
          rowKey={c => c.id}
          emptyText="No clients found. Click New Client to add one."
          rowStyle={c => (c.isActive ? undefined : { opacity: 0.55 })}
          columns={columns}
        />
        {data && <Pager page={data.currentPage} lastPage={data.lastPage} perPage={data.perPage} total={data.total} shown={clients.length} noun="clients" onPage={setPage} />}
      </PageShell>
    </>
  )
}
