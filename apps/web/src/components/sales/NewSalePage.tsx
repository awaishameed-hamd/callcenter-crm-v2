'use client'

// New Sale on one screen: vertical pills on top (Approvals style), a DID card, the form
// sections as colour-headed cards in a two-column grid, and a sticky summary on the right.
// Same fields, rules and API payload as before. The original design is kept in
// NewSalePageClassic.tsx; point app/(dashboard)/agent/new-sale/page.tsx at it to switch back.

import { useState, useEffect, useMemo } from 'react'
import { STANDARD_FIELD_KEYS, snakeToCamel } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { PageTitle } from '@/components/ui/PageChrome'
import { useCompact } from '@/hooks/useMediaQuery'
import { apiGet, apiPost, errMsg, errFields } from '@/lib/api'
import { P } from '@/lib/palette'
import type { FormField } from '@/types'

const FONT      = "'Aptos', sans-serif"
const BEBAS     = "'Bebas Neue', Impact, sans-serif"
const RAJDHANI  = "'Rajdhani', sans-serif"
const ETHNO     = "'Ethnocentric Rg', sans-serif"
const inputCls  = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'
/** StyledSelect reports a plain value; the form's handlers expect a change event. */
const asEvent = (name: string, value: string) => ({ target: { name, value } }) as React.ChangeEvent<any>
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const STANDARD = new Set(STANDARD_FIELD_KEYS.sale)
const VERTICAL_TO_CAMPAIGN: Record<string, string> = { Medicare: 'Medicare', 'Final Expense': 'Final Expense', ACA: 'ACA' }
const FALLBACK_KEYS = ['vertical_type', 'client_id', 'first_name', 'mid_name', 'last_name', 'age', 'date_of_birth', 'phone', 'address', 'city', 'state', 'postal_code', 'transferred_from', 'did_comments', 'reason']

const VERTICAL_COLOR: Record<string, string> = { Medicare: '#1565C0', 'Final Expense': P.purple, ACA: P.teal, Other: P.brick }
const verticalColor = (v?: string) => VERTICAL_COLOR[v ?? ''] ?? P.navy

// Header gradient per section, in order, plus an icon picked from the section name
const SECTION_GRADIENTS = [
  ['#132E57', '#24477F'],
  ['#1E8496', '#0E5F6E'],
  ['#7B2D8E', '#5A1F69'],
  ['#C25A1F', '#9A4415'],
]
const ICONS = {
  person:  'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  address: 'M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z',
  notes:   'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25M8.25 8.25H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z',
  phone:   'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z',
}
const sectionIcon = (name: string) => /address|location/i.test(name) ? ICONS.address : /personal|customer|info/i.test(name) && !/additional/i.test(name) ? ICONS.person : ICONS.notes

type Form = Record<string, string>
type DidOption = { id: string; didCode: string; campaign: string; saleType: string | null }

const filled = (v?: string) => !!v && v.trim() !== ''

// ── Building blocks ──────────────────────────────────────────────────────────

const Svg = ({ d, size = 15 }: { d: string; size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
)

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
        {label}{required && <span style={{ color: '#D62828' }}> *</span>}
      </label>
      {children}
      {error && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#EF4444' }}>{error}</p>}
    </div>
  )
}

/** Card with a filled gradient heading: icon, Bebas title, and a required-field counter or tick. */
function SectionCard({ title, icon, colors, done, total, complete, style, children }: {
  title: string; icon: string; colors: string[]; done: number; total: number; complete: boolean
  style?: React.CSSProperties; children: React.ReactNode
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(19,46,87,0.08), 0 6px 18px -12px rgba(19,46,87,0.25)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`, borderRadius: '12px 12px 0 0', color: '#fff' }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Svg d={icon} />
        </span>
        <span style={{ fontFamily: BEBAS, fontSize: 20, letterSpacing: '0.08em', lineHeight: 1, paddingTop: 2 }}>{title}</span>
        {total > 0 && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontFamily: RAJDHANI, fontSize: 13, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: complete ? '#fff' : 'rgba(255,255,255,0.18)', color: complete ? colors[1] : '#fff', transition: 'all .2s' }}>
            {complete ? '✓ Done' : `${done}/${total}`}
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px 14px' }}>{children}</div>
    </div>
  )
}

function GenericField({ field, value, onChange, error }: { field: FormField; value: string; onChange: (e: React.ChangeEvent<any>) => void; error?: string }) {
  const cls = `${inputCls} ${error ? 'border-red-400' : ''}`
  switch (field.fieldType) {
    case 'textarea':
      return <textarea name={field.fieldKey} value={value} onChange={onChange} rows={Math.min(field.textareaRows || 2, 2)} placeholder={field.placeholder || ''} required={field.isRequired} className={`${cls} resize-none`} />
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
        <StyledSelect value={value} onChange={v => onChange(asEvent(field.fieldKey, v))} required={field.isRequired} placeholder="Select" compact
          borderColor={error ? '#f87171' : undefined} options={(field.options || []).map(opt => ({ value: opt, label: opt }))} />
      )
    default:
      return <input type="text" name={field.fieldKey} value={value} onChange={onChange} placeholder={field.placeholder || ''} required={field.isRequired} className={cls} />
  }
}

function SaleTypeBadge({ type, light }: { type: string; light?: boolean }) {
  const cpa = type === 'CPA'
  return (
    <span style={{ fontFamily: RAJDHANI, fontSize: 11, fontWeight: 700, padding: '0 7px', borderRadius: 99, lineHeight: '17px',
      background: light ? 'rgba(255,255,255,0.25)' : cpa ? '#EDE9FE' : '#CCFBF1', color: light ? '#fff' : cpa ? '#6D28D9' : '#0F766E' }}>
      {type}
    </span>
  )
}

/** The vertical choice, styled exactly like the status pills on the Approvals page. */
function VerticalPills({ options, value, onPick, error }: { options: string[]; value?: string; onPick: (v: string) => void; error?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${error ? '#F87171' : P.border}`, borderRadius: 10, padding: 4, boxShadow: '0 1px 3px rgba(19,46,87,0.06)', overflowX: 'auto', maxWidth: '100%' }}>
          {options.map(v => {
            const active = value === v
            const c = verticalColor(v)
            return (
              <button key={v} type="button" onClick={() => onPick(v)}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap', transition: 'all .15s', background: active ? c : 'transparent', color: active ? '#fff' : '#5C5C5C' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#fff' : c }} />
                {v}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, height: 3, marginTop: 8, padding: '0 4px' }}>
        {options.map(v => (
          <div key={v} style={{ flex: 1, borderRadius: 2, background: verticalColor(v), opacity: value === v ? 1 : 0.3, transition: 'opacity .2s' }} />
        ))}
      </div>
      {error && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#EF4444', textAlign: 'center' }}>{error}</p>}
    </div>
  )
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px dashed ${P.border}` }}>
      <span style={{ fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    // The vertical is picked with pills, so check it here instead of relying on the browser
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

  const vColor = verticalColor(form.vertical_type)
  const verticalOptions = verticalField?.options ?? ['Medicare', 'Final Expense', 'ACA', 'Other']
  const selectedDid = dids.find(d => d.id === form.client_id)
  const customer = [form.first_name, form.last_name].filter(filled).join(' ')
  const initials = [form.first_name, form.last_name].filter(filled).map(s => s.trim()[0].toUpperCase()).join('') || '?'
  const address = [form.address, form.city, [form.state, form.postal_code].filter(filled).join(' ')].filter(filled).join(', ')
  const stats = (list: FormField[]) => {
    const req = list.filter(f => f.isRequired)
    const done = req.filter(f => filled(form[f.fieldKey])).length
    return { done, total: req.length, complete: req.length > 0 && done === req.length }
  }

  // ── DID card ────────────────────────────────────────────────────────────────
  const didCard = (
    <SectionCard title={form.vertical_type === 'Other' ? 'Other Vertical' : didField?.label ?? 'Select DID'} icon={ICONS.phone}
      colors={[P.gold, '#C8890F']} done={form.client_id || (form.vertical_type === 'Other') ? 1 : 0} total={form.vertical_type ? 1 : 0}
      complete={form.vertical_type === 'Other' ? true : filled(form.client_id)}>
      {!form.vertical_type ? (
        <p style={{ margin: 0, fontSize: 13, color: P.textMuted }}>Pick a vertical above to see its DIDs.</p>
      ) : form.vertical_type === 'Other' ? (
        <Field label="Specify Other" error={err('vertical_other')}>
          <input name="vertical_other" type="text" value={form.vertical_other ?? ''} onChange={set} placeholder="Specify vertical type"
            className={`${inputCls} ${err('vertical_other') ? 'border-red-400' : ''}`} />
        </Field>
      ) : didsLoading ? (
        <p style={{ margin: 0, fontSize: 13, color: P.textMuted }}>Loading DIDs...</p>
      ) : dids.length === 0 ? (
        <div className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-600">No active DIDs found for {form.vertical_type}</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 84, overflowY: 'auto', padding: 1 }}>
            {dids.map(d => {
              const on = form.client_id === d.id
              return (
                <button key={d.id} type="button" onClick={() => set(asEvent('client_id', d.id))}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: RAJDHANI, fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', transition: 'all .15s',
                    border: `1.5px solid ${on ? vColor : P.border}`, background: on ? vColor : '#fff', color: on ? '#fff' : P.navy, boxShadow: on ? `0 6px 14px -8px ${vColor}` : 'none' }}>
                  {d.didCode}
                  {d.saleType && <SaleTypeBadge type={d.saleType} light={on} />}
                </button>
              )
            })}
          </div>
          {err('client_id') && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#EF4444' }}>{err('client_id')}</p>}
        </>
      )}
    </SectionCard>
  )

  // ── Summary panel ───────────────────────────────────────────────────────────
  const summary = (
    <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', position: compact ? 'static' : 'sticky', top: 12, boxShadow: '0 1px 3px rgba(19,46,87,0.08), 0 10px 26px -14px rgba(19,46,87,0.35)' }}>
      <div style={{ padding: '14px 18px 16px', background: `linear-gradient(135deg, ${vColor} 0%, ${P.navy} 100%)`, color: '#fff', transition: 'background .3s' }}>
        <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 12, letterSpacing: '0.04em', opacity: 0.9 }}>SALE SUMMARY</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: BEBAS, fontSize: 20, letterSpacing: '0.05em', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: BEBAS, fontSize: 22, letterSpacing: '0.05em', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer || 'New Customer'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.85 }}>{form.phone || 'No phone yet'}</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '6px 18px 16px' }}>
        <SummaryRow label="Vertical">
          {form.vertical_type
            ? <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 12, color: '#fff', background: vColor }}>{form.vertical_type === 'Other' && filled(form.vertical_other) ? form.vertical_other : form.vertical_type}</span>
            : <NotSet />}
        </SummaryRow>
        {form.vertical_type !== 'Other' && (
          <SummaryRow label="DID">
            {selectedDid ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: RAJDHANI, fontSize: 15, fontWeight: 700 }}>{selectedDid.didCode}{selectedDid.saleType && <SaleTypeBadge type={selectedDid.saleType} />}</span> : <NotSet />}
          </SummaryRow>
        )}
        {filled(form.age) && <SummaryRow label="Age">{form.age}</SummaryRow>}
        <SummaryRow label="Address">{address || <NotSet />}</SummaryRow>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Required fields</span>
            <span style={{ fontFamily: BEBAS, fontSize: 20, letterSpacing: '0.04em', color: pct === 100 ? P.teal : P.navy }}>{doneCount}/{requiredKeys.length}</span>
          </div>
          <div style={{ height: 7, borderRadius: 99, background: P.gridLine, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${P.gold}, ${P.teal})`, transition: 'width .3s' }} />
          </div>
        </div>

        <button type="submit" form="new-sale-form" disabled={loading}
          style={{ width: '100%', marginTop: 16, padding: '11px 16px', borderRadius: 10, border: 0, background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', fontFamily: BEBAS, fontSize: 20, letterSpacing: '0.12em', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1, boxShadow: '0 10px 22px -12px rgba(30,132,150,0.9)' }}>
          {loading ? 'Submitting...' : 'Record Sale'}
        </button>
        <button type="button" onClick={resetForm}
          style={{ width: '100%', marginTop: 8, padding: '8px 16px', borderRadius: 10, border: `1px solid ${P.border}`, background: '#fff', color: P.textMuted, fontFamily: RAJDHANI, fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
          Reset Form
        </button>
      </div>
    </div>
  )

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div style={{ padding: '0 20px 16px', minHeight: '100vh', background: P.bgMain, fontFamily: FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, gap: 12, flexWrap: 'wrap' }}>
          <PageTitle>New Sale</PageTitle>
          <span style={{ fontFamily: RAJDHANI, fontSize: 14, fontWeight: 600, color: P.textMuted, letterSpacing: '0.04em' }}>
            Fill the form, then press <b style={{ color: P.teal }}>Record Sale</b>
          </span>
        </div>

        <VerticalPills options={verticalOptions} value={form.vertical_type} onPick={v => set(asEvent('vertical_type', v))} error={err('vertical_type')} />

        <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 290px', gap: 14, alignItems: 'start' }}>
          <form id="new-sale-form" onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 12, minWidth: 0 }}>
            <div style={{ gridColumn: '1 / -1' }}>{didCard}</div>

            {sections.order.map((name, i) => {
              const list = sections.map[name]
              const s = stats(list)
              // An odd last section takes the full row so the grid has no gap
              const fullRow = !compact && sections.order.length % 2 === 1 && i === sections.order.length - 1
              return (
                <SectionCard key={name} title={name} icon={sectionIcon(name)} colors={SECTION_GRADIENTS[i % SECTION_GRADIENTS.length]}
                  done={s.done} total={s.total} complete={s.complete} style={fullRow ? { gridColumn: '1 / -1' } : undefined}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.6rem 0.75rem' }}>
                    {list.map(field => (
                      <div key={field.fieldKey} style={{ gridColumn: `span ${compact ? 6 : COL_SPAN[field.colSpan] ?? 2}` }}>
                        <Field label={field.label} required={field.isRequired} error={err(field.fieldKey)}>
                          <GenericField field={field} value={form[field.fieldKey] ?? ''} onChange={set} error={err(field.fieldKey)} />
                        </Field>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )
            })}
          </form>

          {summary}
        </div>
      </div>
    </>
  )
}
