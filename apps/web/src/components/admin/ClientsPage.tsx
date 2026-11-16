'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { STANDARD_FIELD_KEYS } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { PageShell, PageHeader, FilterBar, FilterSep, FilterPills, FilterSearch, FilterCount, PrimaryButton, SecondaryButton, PlusIcon } from '@/components/ui/PageChrome'
import { P } from '@/lib/palette'
import { useVerticals, campaignsOf, colorOf, verticalBadgeStyle } from '@/lib/verticals'
import VerticalsManager from './VerticalsManager'
import { apiGet, apiPost, apiPut, errMsg, errFields } from '@/lib/api'
import type { Client, Company, FormField } from '@/types'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

const CORE_KEYS = new Set(STANDARD_FIELD_KEYS.client)
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const inputCls  = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400'

// Clients and their lines (2026-11-16): a line is what was a client before (DID, rate, billing
// cycle, opening balance, its own invoices); a client groups its lines into one ledger.
type Form = {
  companyId: string; lineName: string; campaign: string; didCode: string; saleType: string; rateType: string
  rateOfSaleAmount: string; openingBalance: string; cycleOfDay: string; billingStartAfterDays: string; nextBillingDate: string; notes: string
}
const EMPTY: Form = { companyId: '', lineName: '', campaign: '', didCode: '', saleType: '', rateType: 'fixed', rateOfSaleAmount: '', openingBalance: '', cycleOfDay: '', billingStartAfterDays: '', nextBillingDate: '', notes: '' }
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

function LineForm({ initial, companies, companyId, onSubmit, loading, errors }: { initial?: Client; companies: Company[]; companyId?: string; onSubmit: (p: Record<string, unknown>) => void; loading: boolean; errors: Record<string, string[]> }) {
  const isEdit = !!initial
  const { verticals } = useVerticals()
  const campaignOptions = [...campaignsOf(verticals).map(v => v.name), ...(initial?.campaign && !campaignsOf(verticals).some(v => v.name === initial.campaign) ? [initial.campaign] : [])]
  const [form, setForm] = useState<Form>(initial ? {
    companyId: initial.companyId, lineName: initial.lineName, campaign: str(initial.campaign), didCode: str(initial.didCode), saleType: str(initial.saleType),
    rateType: initial.rateType, rateOfSaleAmount: str(initial.rateOfSaleAmount), openingBalance: str(initial.openingBalance),
    cycleOfDay: str(initial.cycleOfDay), billingStartAfterDays: str(initial.billingStartAfterDays), nextBillingDate: str(initial.nextBillingDate).slice(0, 10), notes: str(initial.notes),
  } : { ...EMPTY, companyId: companyId ?? '' })
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Client" required error={err('companyId')}>
          <StyledSelect value={form.companyId} onChange={v => set('companyId', v)} required placeholder="Select client"
            options={companies.map(c => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field label="Line Name" required error={err('lineName')}>
          <input value={form.lineName} onChange={e => set('lineName', e.target.value)} placeholder="e.g. Main, Inbound, Transfers" required className={inputCls} />
        </Field>
      </div>
      {isEdit && initial && form.companyId !== initial.companyId && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">This line and its invoices move to the other client&apos;s ledger.</div>
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
          <p className="mt-1 text-xs text-gray-400">What this line already owed, shown on the client&apos;s ledger.</p>
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
            <p className="mt-1 text-xs text-gray-400">This line's invoice falls due at the end of each cycle.</p>
          </Field>
        )}
        {vis('billing_start_after_days') && (
          <Field label={label('billing_start_after_days', 'Billing Starts After (Days)')} required>
            <input type="number" min="0" value={form.billingStartAfterDays} onChange={e => set('billingStartAfterDays', e.target.value)} placeholder={ph('billing_start_after_days', 'e.g. 0')} required className={inputCls} />
          </Field>
        )}
      </div>
      {/* For a client moved here mid cycle: the day its next invoice falls due, then every cycle after */}
      <Field label="Next Invoice Date">
        <div className="flex items-center gap-2">
          <DateInput value={form.nextBillingDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('nextBillingDate', e.target.value)} className={inputCls} />
          {form.nextBillingDate && (
            <button type="button" onClick={() => set('nextBillingDate', '')} className="shrink-0 px-3 py-2.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-50">Clear</button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {form.nextBillingDate
            ? `The invoice falls due on this date, then every ${form.cycleOfDay || 'cycle'} days after it.`
            : 'Optional. For a client already running when it moved here: the day its next invoice is due. Left empty, the cycle counts from the day the line was added, whether or not sales were approved yet.'}
          {isEdit && initial?.nextInvoiceDue && <> Next invoice due now: <b className="text-gray-600">{new Date(`${initial.nextInvoiceDue}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</b>.</>}
        </p>
      </Field>
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
          {loading ? 'Saving' : isEdit ? 'Save Changes' : 'Create Line'}
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
          <thead><tr style={{ background: '#F2AC18' }}>{['DID', 'Campaign', 'Assigned To', 'Status', ''].map(h => <th key={h} className="px-3 py-2 text-xs font-bold uppercase text-gray-900">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(d => (
              <tr key={d.id} className={d.isActive ? '' : 'opacity-50'}>
                <td className="px-3 py-2 font-mono font-semibold">{d.didCode}</td>
                <td className="px-3 py-2 text-xs"><span style={verticalBadgeStyle(colorOf(verticals, d.campaign))}>{d.campaign}</span></td>
                <td className="px-3 py-2 text-xs text-gray-600">{d.assignedTo ?? 'Available'}</td>
                <td className="px-3 py-2 text-xs">{d.isActive ? 'Active' : 'Inactive'}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => toggle(d.id)} disabled={!!d.assignedTo && d.isActive} title={d.assignedTo && d.isActive ? 'Unassign it from the line first' : ''}
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

function CompanyForm({ initial, onSubmit, loading, errors }: { initial?: Company; onSubmit: (p: Record<string, unknown>) => void; loading: boolean; errors: Record<string, string[]> }) {
  const [name, setName]   = useState(initial?.name ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ name, notes: notes.trim() || null }) }} className="space-y-4">
      <Field label="Client Name" required error={errors.name?.[0]}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Centerfield" required className={inputCls} />
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional notes" className={`${inputCls} resize-none`} />
      </Field>
      <p className="text-xs text-gray-500">A client groups its lines into one ledger. Each line keeps its own DID, rate, billing cycle, opening balance and invoices.</p>
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-60">
          {loading ? 'Saving' : initial ? 'Save Changes' : 'Create Client'}
        </button>
      </div>
    </form>
  )
}

const F = "'Aptos', sans-serif"
const TH: React.CSSProperties = { padding: '7px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#1a1a1a', fontFamily: F, letterSpacing: '0.07em', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { padding: '6px 12px', fontSize: 12, fontFamily: F, color: '#1a1a1a', borderBottom: `1px solid ${P.border}50`, whiteSpace: 'nowrap' }
const EDIT_ICON = 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931zm0 0L19.5 7.125'
const HEADS = ['Line', 'Campaign', 'Assigned DID', 'Type', 'Rate Type', 'Rate', 'Opening Bal.', 'Cycle', 'Next Invoice', 'Status', 'Actions']
const shortDate = (ymd?: string | null) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')

export default function ClientsPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch]       = useState('')
  const [campaignFilter, setCampaignFilter] = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [loading, setLoading]     = useState(true)
  const [lineModal, setLineModal] = useState<{ line?: Client; companyId?: string } | null>(null)
  const [companyModal, setCompanyModal] = useState<{ company?: Company } | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<Client | null>(null)
  const [showPool, setShowPool]   = useState(false)
  const [showVerticals, setShowVerticals] = useState(false)
  const { verticals, reload: reloadVerticals } = useVerticals()
  const [busy, setBusy]           = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({})
  const [toast, setToast]         = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setCompanies(await apiGet<Company[]>('/companies'))
    } catch {
      if (!silent) setToast({ message: 'Failed to load clients.', type: 'error' })
    } finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useAutoRefresh(() => fetchAll(true))

  const saveLine = async (payload: Record<string, unknown>) => {
    const editing = lineModal?.line
    setBusy(true); setFormErrors({})
    try {
      if (editing) await apiPut(`/clients/${editing.id}`, payload)
      else await apiPost('/clients', payload)
      setToast({ message: editing ? 'Line updated successfully.' : 'Line created successfully.', type: 'success' })
      setLineModal(null)
      fetchAll()
    } catch (e) {
      setFormErrors(errFields(e))
      setToast({ message: errMsg(e, 'Failed to save line.'), type: 'error' })
    } finally { setBusy(false) }
  }

  const saveCompany = async (payload: Record<string, unknown>) => {
    const editing = companyModal?.company
    setBusy(true); setFormErrors({})
    try {
      if (editing) await apiPut(`/companies/${editing.id}`, payload)
      else await apiPost('/companies', payload)
      setToast({ message: editing ? 'Client updated successfully.' : 'Client created. Add its lines next.', type: 'success' })
      setCompanyModal(null)
      fetchAll()
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
      fetchAll()
    } catch (e) {
      setToast({ message: errMsg(e, 'Failed to update line status.'), type: 'error' })
    }
  }

  // Filters apply to the lines; a client shows when its name matches or any of its lines does
  const q = search.trim().toLowerCase()
  const lineShown = (l: Client, nameHit: boolean) =>
    (!campaignFilter || l.campaign === campaignFilter) &&
    (!statusFilter || l.isActive === (statusFilter === 'active')) &&
    (!q || nameHit || l.lineName.toLowerCase().includes(q) || (l.didCode ?? '').toLowerCase().includes(q))
  const groups = companies
    .map(c => {
      const nameHit = !!q && c.name.toLowerCase().includes(q)
      return { company: c, lines: c.lines.filter(l => lineShown(l, nameHit)), nameHit }
    })
    .filter(g => g.lines.length > 0 || (!campaignFilter && !statusFilter && (!q || g.nameHit)))
  const lineCount = groups.reduce((s, g) => s + g.lines.length, 0)

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
  const pillBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 11px', borderRadius: 30, border: `1px solid ${P.teal}55`, background: '#fff', color: P.teal, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: F }
  const center: React.CSSProperties = { ...TD, textAlign: 'center' }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {lineModal && (
        <Modal title={lineModal.line ? `Edit Line: ${lineModal.line.companyName}` : 'New Line'} onClose={() => { setLineModal(null); setFormErrors({}) }}>
          <LineForm initial={lineModal.line} companies={companies} companyId={lineModal.companyId} onSubmit={saveLine} loading={busy} errors={formErrors} />
        </Modal>
      )}
      {companyModal && (
        <Modal title={companyModal.company ? `Edit Client: ${companyModal.company.name}` : 'New Client'} onClose={() => { setCompanyModal(null); setFormErrors({}) }}>
          <CompanyForm initial={companyModal.company} onSubmit={saveCompany} loading={busy} errors={formErrors} />
        </Modal>
      )}
      {showPool && <DidPoolModal onClose={() => setShowPool(false)} setToast={setToast} />}
      {showVerticals && (
        <Modal title="Verticals" wide onClose={() => { setShowVerticals(false); reloadVerticals(); fetchAll() }}>
          <VerticalsManager />
        </Modal>
      )}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmToggle(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-sm text-gray-700 mb-5">
              {confirmToggle.isActive ? 'Deactivate' : 'Activate'} line &quot;{confirmToggle.companyName}&quot;?{' '}
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
          <SecondaryButton onClick={() => { setCompanyModal({}); setFormErrors({}) }}><PlusIcon /> New Client</SecondaryButton>
          <PrimaryButton onClick={() => { setLineModal({}); setFormErrors({}) }} disabled={!companies.length}><PlusIcon /> New Line</PrimaryButton>
        </>} />

        <FilterBar>
          <FilterPills value={campaignFilter} onChange={setCampaignFilter}
            options={[{ value: '', label: 'All Campaigns' }, ...verticals.filter(v => !v.isOther).map(v => ({ value: v.name, label: v.name }))]} />
          <FilterSep />
          <FilterPills value={statusFilter} onChange={setStatusFilter}
            options={[['', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as const} />
          <FilterSep />
          <FilterSearch value={search} onChange={setSearch} placeholder="Client, line or DID" width={220} />
          <FilterCount>{groups.length} client{groups.length !== 1 ? 's' : ''}, {lineCount} line{lineCount !== 1 ? 's' : ''}</FilterCount>
        </FilterBar>

        <div style={{ background: '#fff', borderRadius: 10, boxShadow: P.shadow, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F2AC18' }}>{HEADS.map(h => <th key={h} style={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={HEADS.length} style={{ ...center, color: P.textMuted, padding: 28 }}>Loading clients…</td></tr>}
              {!loading && !groups.length && (
                <tr><td colSpan={HEADS.length} style={{ ...center, color: P.textMuted, padding: 28 }}>
                  {companies.length ? 'No client or line matches these filters.' : 'No clients yet. Click New Client, then add its lines.'}
                </td></tr>
              )}
              {!loading && groups.map(({ company: c, lines }) => (
                <Fragment key={c.id}>
                  <tr style={{ background: '#EAF4F6' }}>
                    <td colSpan={HEADS.length} style={{ ...TD, padding: '7px 12px', borderBottom: `1px solid ${P.teal}30` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: P.navy, letterSpacing: '0.01em' }}>{c.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: P.teal, background: '#fff', borderRadius: 30, padding: '1px 9px', border: `1px solid ${P.teal}33` }}>
                          {c.lines.length} line{c.lines.length !== 1 ? 's' : ''}
                        </span>
                        {c.notes && <span style={{ fontSize: 11.5, color: P.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>{c.notes}</span>}
                        <span style={{ flex: 1 }} />
                        <button style={pillBtn} onClick={() => { setLineModal({ companyId: c.id }); setFormErrors({}) }}><PlusIcon /> Add Line</button>
                        <button style={pillBtn} onClick={() => { setCompanyModal({ company: c }); setFormErrors({}) }}>Edit Client</button>
                      </div>
                    </td>
                  </tr>
                  {!lines.length && (
                    <tr><td colSpan={HEADS.length} style={{ ...TD, color: P.textMuted, paddingLeft: 30 }}>No lines yet.</td></tr>
                  )}
                  {lines.map(l => (
                    <tr key={l.id} style={l.isActive ? undefined : { opacity: 0.55 }}>
                      <td style={{ ...TD, paddingLeft: 30 }}>
                        <span style={{ color: '#CBD5E1', marginRight: 7 }}>└</span>
                        <span style={{ fontWeight: 600, color: P.textHeading }}>{l.lineName}</span>
                      </td>
                      <td style={center}>{l.campaign ? <span style={verticalBadgeStyle(colorOf(verticals, l.campaign))}>{l.campaign}</span> : na}</td>
                      <td style={center}>{l.didCode ? <span style={{ fontSize: 12, fontWeight: 700, color: P.teal, letterSpacing: '0.04em' }}>{l.didCode}</span> : na}</td>
                      <td style={center}>{l.saleType ? tw(l.saleType === 'CPA' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700', l.saleType) : na}</td>
                      <td style={center}><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${l.rateType === 'fixed' ? 'bg-slate-100 text-slate-700' : 'bg-orange-100 text-orange-700'}`}>{l.rateType === 'fixed' ? 'Fixed' : 'Variable'}</span></td>
                      <td style={center}>{l.rateType === 'fixed' && l.rateOfSaleAmount != null ? <span style={{ fontSize: 12, color: P.slate }}>${Number(l.rateOfSaleAmount).toLocaleString()}</span> : na}</td>
                      <td style={center}>{l.openingBalance != null && Number(l.openingBalance) > 0
                        ? <span style={{ fontSize: 12, fontWeight: 600, color: P.forest }}>${Number(l.openingBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> : na}</td>
                      <td style={center}><span style={{ fontSize: 12, color: P.slate }}>{l.cycleOfDay ? `${l.cycleOfDay}d` : 'N/A'}</span></td>
                      <td style={center} title={l.nextBillingDate ? 'Set by Next Invoice Date' : 'From the billing cycle'}>{l.nextInvoiceDue
                        ? <span style={{ fontSize: 12, fontWeight: 600, color: l.nextBillingDate ? P.teal : P.slate }}>{shortDate(l.nextInvoiceDue)}</span> : na}</td>
                      <td style={center}>{tw(l.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500', l.isActive ? 'Active' : 'Inactive')}</td>
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          {iconBtn('Edit line', () => { setLineModal({ line: l }); setFormErrors({}) }, '#2563EB', EDIT_ICON)}
                          {iconBtn(l.isActive ? 'Deactivate' : 'Activate', () => setConfirmToggle(l), l.isActive ? '#DC2626' : '#16A34A',
                            l.isActive ? 'M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </PageShell>
    </>
  )
}
