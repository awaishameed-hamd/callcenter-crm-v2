'use client'

// New Sale, modern layout in the style of argroup's Tasks page: verticals as coloured
// pills, DIDs as clickable chips, numbered section cards and a sticky summary panel.
// Same fields, rules and API calls as before. The previous design is kept in
// NewSalePageClassic.tsx; point app/(dashboard)/agent/new-sale/page.tsx at it to switch back.

import { useState, useEffect, useMemo } from 'react'
import { STANDARD_FIELD_KEYS, snakeToCamel } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { PageShell, PageHeader } from '@/components/ui/PageChrome'
import { useCompact } from '@/hooks/useMediaQuery'
import { apiGet, apiPost, errMsg, errFields } from '@/lib/api'
import { P } from '@/lib/palette'
import type { FormField } from '@/types'

const FONT = "'Aptos', sans-serif"
const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'
/** StyledSelect reports a plain value; the form's handlers expect a change event. */
const asEvent = (name: string, value: string) => ({ target: { name, value } }) as React.ChangeEvent<any>
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const STANDARD = new Set(STANDARD_FIELD_KEYS.sale)
const VERTICAL_TO_CAMPAIGN: Record<string, string> = { Medicare: 'Medicare', 'Final Expense': 'Final Expense', ACA: 'ACA' }
const FALLBACK_KEYS = ['vertical_type', 'client_id', 'first_name', 'mid_name', 'last_name', 'age', 'date_of_birth', 'phone', 'address', 'city', 'state', 'postal_code', 'transferred_from', 'did_comments', 'reason']
const VERTICAL_COLOR: Record<string, string> = { Medicare: '#1565C0', 'Final Expense': P.purple, ACA: P.teal, Other: P.brick }
const verticalColor = (v?: string) => VERTICAL_COLOR[v ?? ''] ?? P.slate

type Form = Record<string, string>
type DidOption = { id: string; didCode: string; campaign: string; saleType: string | null }

const filled = (v?: string) => !!v && v.trim() !== ''

// ── Building blocks ──────────────────────────────────────────────────────────

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {label}{required && <span style={{ color: '#D62828' }}> *</span>}
      </label>
      {children}
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#EF4444' }}>{error}</p>}
    </div>
  )
}

/** Section card with argroup's numbered badge; the badge turns into a check once the section is complete. */
function StepCard({ step, title, done, children }: { step: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderBottom: `1px solid ${P.border}`, background: '#F8FAFC', borderRadius: '12px 12px 0 0' }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, background: done ? P.teal : '#A5D8DD', color: done ? '#fff' : '#000', transition: 'background .2s' }}>
          {done ? '✓' : step}
        </span>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.navy, fontFamily: FONT }}>{title}</h3>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
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

function SaleTypeBadge({ type }: { type: string }) {
  const cpa = type === 'CPA'
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: cpa ? '#EDE9FE' : '#CCFBF1', color: cpa ? '#6D28D9' : '#0F766E' }}>{type}</span>
}

/** Step 1: vertical as coloured pills, then the DIDs of that vertical as chips. */
function VerticalDIDStep({ verticalField, didField, form, dids, didsLoading, set, err, done }: {
  verticalField?: FormField; didField?: FormField; form: Form; dids: DidOption[]; didsLoading: boolean
  set: (e: React.ChangeEvent<any>) => void; err: (k: string) => string | undefined; done: boolean
}) {
  const verticalOptions = verticalField?.options ?? ['Medicare', 'Final Expense', 'ACA', 'Other']
  const showOther = form.vertical_type === 'Other'
  const showDID = !!form.vertical_type && form.vertical_type !== 'Other'

  return (
    <StepCard step={1} title={verticalField?.section ?? 'Vertical & DID'} done={done}>
      <Field label={verticalField?.label ?? 'Vertical Type'} required={verticalField?.isRequired ?? true} error={err('vertical_type')}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))`, gap: 10 }}>
          {verticalOptions.map(v => {
            const active = form.vertical_type === v
            const c = verticalColor(v)
            return (
              <button key={v} type="button" onClick={() => set(asEvent('vertical_type', v))}
                style={{
                  padding: '14px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${active ? c : P.border}`, background: active ? c : '#fff', color: active ? '#fff' : P.navy,
                  boxShadow: active ? `0 8px 18px -10px ${c}` : 'none', transition: 'all .15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = c }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = P.border }}>
                <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : c, margin: '0 auto 6px' }} />
                {v}
              </button>
            )
          })}
        </div>
        {/* Coloured underline bars, same idea as the Approvals pills */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))`, gap: 10, marginTop: 6 }}>
          {verticalOptions.map(v => (
            <div key={v} style={{ height: 3, borderRadius: 2, background: verticalColor(v), opacity: form.vertical_type === v ? 1 : 0.25, transition: 'opacity .2s' }} />
          ))}
        </div>
      </Field>

      {showOther && (
        <div style={{ marginTop: 16 }}>
          <Field label="Specify Other" error={err('vertical_other')}>
            <input name="vertical_other" type="text" value={form.vertical_other ?? ''} onChange={set} placeholder="Specify vertical type"
              className={`${inputCls} ${err('vertical_other') ? 'border-red-400' : ''}`} />
          </Field>
        </div>
      )}

      {showDID && didField && (
        <div style={{ marginTop: 16 }}>
          <Field label={didField.label ?? 'Select DID'} required={didField.isRequired ?? true} error={err('client_id')}>
            {didsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: `1px solid ${P.border}`, background: '#F8FAFC', fontSize: 13, color: P.textMuted }}>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: P.teal }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
                Loading DIDs
              </div>
            ) : dids.length === 0 ? (
              <div className="px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-600">No active DIDs found for {form.vertical_type}</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 190, overflowY: 'auto', padding: 2 }}>
                {dids.map(d => {
                  const on = form.client_id === d.id
                  return (
                    <button key={d.id} type="button" onClick={() => set(asEvent('client_id', d.id))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                        fontFamily: FONT, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', transition: 'all .15s',
                        border: `1.5px solid ${on ? P.teal : P.border}`, background: on ? P.fillTeal : '#fff', color: on ? P.teal : P.navy,
                      }}>
                      {on && <span style={{ fontSize: 11 }}>✓</span>}
                      {d.didCode}
                      {d.saleType && <SaleTypeBadge type={d.saleType} />}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>
        </div>
      )}
    </StepCard>
  )
}

/** One line of the summary panel. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${P.border}60` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: P.navy, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  )
}
const NotSet = () => <span style={{ color: '#9CA3AF', fontWeight: 400 }}>Not entered</span>

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewSalePage() {
  const compact = useCompact()
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

  const verticalField = config?.find(f => f.fieldKey === 'vertical_type')
  const didField      = config?.find(f => f.fieldKey === 'client_id') ?? (config?.length ? undefined : { fieldKey: 'client_id', label: 'Select DID', isRequired: true } as FormField)
  const verticalRequired = verticalField?.isRequired ?? true
  const needsDid = !!form.vertical_type && form.vertical_type !== 'Other' && !!didField

  // Progress across every required field, including vertical and DID
  const requiredKeys = useMemo(() => {
    const keys = (config ?? []).filter(f => f.isRequired && f.fieldKey !== 'vertical_type' && f.fieldKey !== 'client_id' && f.fieldKey !== 'vertical_other').map(f => f.fieldKey)
    if (verticalRequired) keys.unshift('vertical_type')
    if (needsDid) keys.splice(1, 0, 'client_id')
    return keys
  }, [config, verticalRequired, needsDid])
  const doneCount = requiredKeys.filter(k => filled(form[k])).length
  const pct = requiredKeys.length ? Math.round((doneCount / requiredKeys.length) * 100) : 100
  const sectionDone = (list: FormField[]) => list.filter(f => f.isRequired).every(f => filled(form[f.fieldKey])) && list.some(f => f.isRequired || filled(form[f.fieldKey]))
  const step1Done = (!verticalRequired || filled(form.vertical_type)) && (!needsDid || filled(form.client_id)) && filled(form.vertical_type)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    // The vertical is picked with buttons, so check it here instead of relying on the browser
    if (verticalRequired && !form.vertical_type) {
      setErrors({ vertical_type: ['Please select a vertical.'] })
      setToast({ message: 'Please select a vertical before submitting.', type: 'error' })
      return
    }
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

  const selectedDid = dids.find(d => d.id === form.client_id)
  const customer = [form.first_name, form.last_name].filter(filled).join(' ')
  const location = [form.city, [form.state, form.postal_code].filter(filled).join(' ')].filter(filled).join(', ')

  const summary = (
    <div style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 12, overflow: 'hidden', position: compact ? 'static' : 'sticky', top: 12 }}>
      <div style={{ height: 4, background: verticalColor(form.vertical_type), opacity: form.vertical_type ? 1 : 0.25, transition: 'background .2s' }} />
      <div style={{ padding: '14px 18px 18px' }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.navy }}>Sale Summary</p>
        <SummaryRow label="Vertical">
          {form.vertical_type
            ? <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 12, color: '#fff', background: verticalColor(form.vertical_type) }}>{form.vertical_type === 'Other' && filled(form.vertical_other) ? form.vertical_other : form.vertical_type}</span>
            : <NotSet />}
        </SummaryRow>
        {form.vertical_type !== 'Other' && (
          <SummaryRow label="DID">
            {selectedDid ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{selectedDid.didCode}{selectedDid.saleType && <SaleTypeBadge type={selectedDid.saleType} />}</span> : <NotSet />}
          </SummaryRow>
        )}
        <SummaryRow label="Customer">{customer || <NotSet />}</SummaryRow>
        <SummaryRow label="Phone">{form.phone || <NotSet />}</SummaryRow>
        <SummaryRow label="Location">{location || <NotSet />}</SummaryRow>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            <span>Required fields</span>
            <span style={{ color: pct === 100 ? P.teal : P.navy }}>{doneCount} of {requiredKeys.length}</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: P.gridLine, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${P.teal}, #0E5F6E)`, transition: 'width .3s' }} />
          </div>
        </div>

        <button type="submit" form="new-sale-form" disabled={loading}
          style={{ width: '100%', marginTop: 16, padding: '11px 16px', borderRadius: 10, border: 0, background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', fontFamily: FONT, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1, boxShadow: '0 8px 20px -10px rgba(30,132,150,0.7)' }}>
          {loading ? 'Submitting...' : 'Record Sale'}
        </button>
        <button type="button" onClick={resetForm}
          style={{ width: '100%', marginTop: 8, padding: '9px 16px', borderRadius: 10, border: `1px solid ${P.border}`, background: '#fff', color: P.textMuted, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
          Reset Form
        </button>
      </div>
    </div>
  )

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <PageShell>
        <PageHeader title="New Sale" />

        <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start', maxWidth: 1180 }}>
          <form id="new-sale-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <VerticalDIDStep verticalField={verticalField} didField={didField} form={form} dids={dids} didsLoading={didsLoading} set={set} err={err} done={step1Done} />

            {sections.order.map((name, i) => (
              <StepCard key={name} step={i + 2} title={name} done={sectionDone(sections.map[name])}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.9rem 1rem' }}>
                  {sections.map[name].map(field => (
                    <div key={field.fieldKey} style={{ gridColumn: `span ${compact ? 6 : COL_SPAN[field.colSpan] ?? 2}` }}>
                      <Field label={field.label} required={field.isRequired} error={err(field.fieldKey)}>
                        <GenericField field={field} value={form[field.fieldKey] ?? ''} onChange={set} error={err(field.fieldKey)} />
                      </Field>
                    </div>
                  ))}
                </div>
              </StepCard>
            ))}
          </form>

          {summary}
        </div>
      </PageShell>
    </>
  )
}
