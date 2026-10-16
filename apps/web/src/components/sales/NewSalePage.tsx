'use client'

import { useState, useEffect, useMemo } from 'react'
import { STANDARD_FIELD_KEYS, snakeToCamel } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { apiGet, apiPost, errMsg, errFields } from '@/lib/api'
import type { FormField } from '@/types'

const inputCls  = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'
/** StyledSelect reports a plain value; the form's handlers expect a change event. */
const asEvent = (name: string, value: string) => ({ target: { name, value } }) as React.ChangeEvent<any>
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const STANDARD = new Set(STANDARD_FIELD_KEYS.sale)
const VERTICAL_TO_CAMPAIGN: Record<string, string> = { Medicare: 'Medicare', 'Final Expense': 'Final Expense', ACA: 'ACA' }
const FALLBACK_KEYS = ['vertical_type', 'client_id', 'first_name', 'mid_name', 'last_name', 'age', 'date_of_birth', 'phone', 'address', 'city', 'state', 'postal_code', 'transferred_from', 'did_comments', 'reason']

type Form = Record<string, string>
type DidOption = { id: string; didCode: string; campaign: string; saleType: string | null }

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function GenericField({ field, value, onChange, error }: { field: FormField; value: string; onChange: (e: React.ChangeEvent<any>) => void; error?: string }) {
  const cls = `${inputCls} ${error ? 'border-red-400' : ''}`
  switch (field.fieldType) {
    case 'textarea':
      return <textarea name={field.fieldKey} value={value} onChange={onChange} rows={field.textareaRows || 3} placeholder={field.placeholder || ''} required={field.isRequired} className={`${cls} resize-none`} />
    case 'date':
      return <DateInput name={field.fieldKey} value={value} onChange={onChange} required={field.isRequired} className={`${cls} text-gray-800`} />
    case 'number':
      return <input type="number" name={field.fieldKey} value={value} onChange={onChange} placeholder={field.placeholder || ''} required={field.isRequired} className={cls} />
    case 'amount_usd':
    case 'amount_pkr':
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold select-none" style={{ color: field.fieldType === 'amount_usd' ? '#065F46' : '#92400E' }}>
            {field.fieldType === 'amount_usd' ? '$' : '₨'}
          </span>
          <input type="number" min="0" step="0.01" name={field.fieldKey} value={value} onChange={onChange} placeholder="0.00" required={field.isRequired} className={`${cls} pl-7`} />
        </div>
      )
    case 'select':
      return (
        <StyledSelect value={value} onChange={v => onChange(asEvent(field.fieldKey, v))} required={field.isRequired} placeholder="Select"
          borderColor={error ? '#f87171' : undefined} options={(field.options || []).map(opt => ({ value: opt, label: opt }))} />
      )
    default:
      return <input type="text" name={field.fieldKey} value={value} onChange={onChange} placeholder={field.placeholder || ''} required={field.isRequired} className={cls} />
  }
}

function VerticalDIDSection({ verticalField, didField, form, dids, didsLoading, set, err }: {
  verticalField?: FormField; didField?: FormField; form: Form; dids: DidOption[]; didsLoading: boolean
  set: (e: React.ChangeEvent<any>) => void; err: (k: string) => string | undefined
}) {
  const verticalOptions = verticalField?.options ?? ['Medicare', 'Final Expense', 'ACA', 'Other']
  const showOther = form.vertical_type === 'Other'
  const showDID = !!form.vertical_type && form.vertical_type !== 'Other'
  const selected = dids.find(d => d.id === form.client_id)

  return (
    <Section title={verticalField?.section ?? 'Vertical & DID'}>
      <div className="grid grid-cols-2 gap-4 items-start">
        <Field label={verticalField?.label ?? 'Vertical Type'} required={verticalField?.isRequired ?? true} error={err('vertical_type')}>
          <StyledSelect value={form.vertical_type ?? ''} onChange={v => set(asEvent('vertical_type', v))} required={verticalField?.isRequired ?? true}
            placeholder="Select vertical" borderColor={err('vertical_type') ? '#f87171' : undefined}
            options={verticalOptions.map(v => ({ value: v, label: v }))} />
        </Field>

        {showOther && (
          <Field label="Specify Other" error={err('vertical_other')}>
            <input name="vertical_other" type="text" value={form.vertical_other ?? ''} onChange={set} placeholder="Specify vertical type"
              className={`${inputCls} ${err('vertical_other') ? 'border-red-400' : ''}`} />
          </Field>
        )}

        {showDID && didField && (
          <Field label={didField.label ?? 'Select DID'} required={didField.isRequired ?? true} error={err('client_id')}>
            {didsLoading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-300 bg-gray-50">
                <svg className="h-4 w-4 animate-spin text-teal-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
                <span className="text-sm text-gray-400">Loading DIDs</span>
              </div>
            ) : dids.length === 0 ? (
              <div className="px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-600">No active DIDs found for {form.vertical_type}</div>
            ) : (
              <div className="space-y-1.5">
                <StyledSelect value={form.client_id ?? ''} onChange={v => set(asEvent('client_id', v))} required={didField.isRequired ?? true}
                  placeholder="Select DID" borderColor={err('client_id') ? '#f87171' : undefined}
                  options={dids.map(d => ({ value: d.id, label: d.didCode }))} />
                {selected?.saleType && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Sale Type:</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${selected.saleType === 'CPA' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'}`}>{selected.saleType}</span>
                  </div>
                )}
              </div>
            )}
          </Field>
        )}
      </div>
    </Section>
  )
}

export default function NewSalePage() {
  const [config, setConfig]           = useState<FormField[] | null>(null)
  const [form, setForm]               = useState<Form>({})
  const [dids, setDids]               = useState<DidOption[]>([])
  const [didsLoading, setDidsLoading] = useState(false)
  const [errors, setErrors]           = useState<Record<string, string[]>>({})
  const [loading, setLoading]         = useState(false)
  const [toast, setToast]             = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const emptyForm = (fields: FormField[]) => {
    const empty: Form = { vertical_other: '' }
    ;(fields.length ? fields.map(f => f.fieldKey) : FALLBACK_KEYS).forEach(k => { empty[k] = '' })
    return empty
  }

  useEffect(() => {
    apiGet<FormField[]>('/crm/form-fields/public', { formType: 'sale' })
      .then(fields => { setConfig(fields); setForm(emptyForm(fields)) })
      .catch(() => { setConfig([]); setForm(emptyForm([])) })
  }, [])

  useEffect(() => {
    const campaign = VERTICAL_TO_CAMPAIGN[form.vertical_type ?? '']
    setForm(p => ({ ...p, client_id: '' }))
    setDids([])
    if (!campaign) return
    setDidsLoading(true)
    apiGet<DidOption[]>('/clients/dropdown', { campaign })
      .then(setDids)
      .catch(() => setDids([]))
      .finally(() => setDidsLoading(false))
  }, [form.vertical_type])

  const set = (e: React.ChangeEvent<any>) => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    if (errors[name]) setErrors(p => ({ ...p, [name]: undefined as unknown as string[] }))
  }
  const err = (k: string) => errors[k]?.[0]

  const resetForm = () => {
    setForm(emptyForm(config ?? []))
    setDids([])
    setErrors({})
  }

  const sections = useMemo(() => {
    const map: Record<string, FormField[]> = {}
    const order: string[] = []
    ;(config ?? []).forEach(f => {
      if (f.fieldKey === 'vertical_type' || f.fieldKey === 'client_id' || f.fieldKey === 'vertical_other') return
      const s = f.section || 'Other'
      if (!map[s]) { map[s] = []; order.push(s) }
      map[s].push(f)
    })
    return { map, order }
  }, [config])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    if (form.vertical_type && form.vertical_type !== 'Other' && !form.client_id) {
      setErrors({ client_id: ['DID selection is required.'] })
      setToast({ message: 'Please select a DID before submitting.', type: 'error' })
      return
    }
    const payload: Record<string, unknown> = {}
    const extraFields: Record<string, unknown> = {}
    Object.entries(form).forEach(([k, v]) => {
      const val = v === '' ? null : v
      if (STANDARD.has(k) || k === 'vertical_other') payload[snakeToCamel(k)] = val
      else if (val !== null) extraFields[k] = val
    })
    if (Object.keys(extraFields).length) payload.extraFields = extraFields

    setLoading(true)
    try {
      await apiPost('/customers', payload)
      setToast({ message: 'Sale recorded successfully!', type: 'success' })
      resetForm()
    } catch (e) {
      const fields = errFields(e)
      if (Object.keys(fields).length) {
        setErrors(fields)
        setToast({ message: 'Please fix the highlighted errors.', type: 'error' })
      } else {
        setToast({ message: errMsg(e, 'Submission failed. Please try again.'), type: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  if (config === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500" />
      </div>
    )
  }

  const verticalField = config.find(f => f.fieldKey === 'vertical_type')
  const didField      = config.find(f => f.fieldKey === 'client_id') ?? (config.length ? undefined : { fieldKey: 'client_id', label: 'Select DID', isRequired: true } as FormField)

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-black" style={{ color: '#132E57', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>New Sale</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submit a new customer record</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <VerticalDIDSection verticalField={verticalField} didField={didField} form={form} dids={dids} didsLoading={didsLoading} set={set} err={err} />

          {sections.order.map(name => (
            <Section key={name} title={name}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem' }}>
                {sections.map[name].map(field => (
                  <div key={field.fieldKey} style={{ gridColumn: `span ${COL_SPAN[field.colSpan] ?? 2}` }}>
                    <Field label={field.label} required={field.isRequired} error={err(field.fieldKey)}>
                      <GenericField field={field} value={form[field.fieldKey] ?? ''} onChange={set} error={err(field.fieldKey)} />
                    </Field>
                  </div>
                ))}
              </div>
            </Section>
          ))}

          <div className="flex items-center justify-end gap-3 pb-6">
            <button type="button" onClick={resetForm} className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ border: '1px solid #5C6D82', color: '#5C6D82', background: 'transparent' }}>
              Reset
            </button>
            <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)', color: '#ffffff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
              {loading ? 'Submitting' : 'Record Sale'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
