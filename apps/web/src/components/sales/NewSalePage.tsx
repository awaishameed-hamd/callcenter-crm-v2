'use client'

// New Sale on one screen: vertical pills on top (same as the Approvals pills), a horizontal
// summary bar with the Record Sale button, then the DID tiles and form sections as cards with
// gold table-style headings. On a desktop the cards stretch to the bottom of the screen.
//
// Everything below the pills follows CRM Management > Sale Form (GET /crm/form-fields/public):
//   - sections and their order become the cards (the first sits beside the DID card)
//   - labels, placeholders, required flags, widths, dropdown options and visibility come from there
//   - Textarea fields are drawn as large boxes filling the bottom of their card; "Rows" is their
//     minimum height. Every other field sits above them, sized by its "Width".
//   - the pills are the active verticals from Verticals settings (name, colour, order); a vertical's
//     DIDs are the DIDs whose campaign is that vertical, and the "Other" vertical needs none.

import { useState, useEffect, useMemo, useRef } from 'react'
import { STANDARD_FIELD_KEYS, snakeToCamel } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { useCompact } from '@/hooks/useMediaQuery'
import { useVerticals, FALLBACK_COLOR, type Vertical } from '@/lib/verticals'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { apiGet, apiPost, errMsg, errFields } from '@/lib/api'
import { P } from '@/lib/palette'
import type { FormField } from '@/types'
import { FONT, BEBAS, CRISP, RAJDHANI, ETHNO, inputCls, withAlpha, ICONS, Svg, Field, SectionCard, SaleTypeBadge, SummaryItem, NotSet } from './saleUi'

/** StyledSelect reports a plain value; the form's handlers expect a change event. */
const asEvent = (name: string, value: string) => ({ target: { name, value } }) as React.ChangeEvent<any>
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const STANDARD = new Set(STANDARD_FIELD_KEYS.sale)
const FALLBACK_KEYS = ['vertical_type', 'client_id', 'first_name', 'mid_name', 'last_name', 'age', 'date_of_birth', 'phone', 'address', 'city', 'state', 'postal_code', 'transferred_from', 'did_comments', 'reason']

const sectionIcon = (name: string) => /address|location/i.test(name) ? ICONS.address : /personal|customer|info/i.test(name) && !/additional/i.test(name) ? ICONS.person : ICONS.notes

type Form = Record<string, string>
type DidOption = { id: string; didCode: string; campaign: string; saleType: string | null }

const filled = (v?: string) => !!v && v.trim() !== ''
/** Textarea fields (set in CRM Management) are drawn as a big box filling the rest of their card. */
const isFillField = (f: FormField) => f.fieldType === 'textarea'

// ── Building blocks ──────────────────────────────────────────────────────────


function GenericField({ field, value, onChange, error, fill }: { field: FormField; value: string; onChange: (e: React.ChangeEvent<any>) => void; error?: string; fill?: boolean }) {
  const cls = `${inputCls} ${error ? 'border-red-400' : ''}`
  switch (field.fieldType) {
    case 'textarea':
      return (
        <textarea name={field.fieldKey} value={value} onChange={onChange} rows={fill ? undefined : Math.min(field.textareaRows || 2, 2)}
          placeholder={field.placeholder || ''} required={field.isRequired} className={`${cls} resize-none`}
          style={fill ? { flex: 1, minHeight: (field.textareaRows || 2) * 20 + 18 } : undefined} />
      )
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


/** The vertical choice: an exact copy of the status pills and colour bars on the Approvals page. */
function VerticalPills({ options, value, onPick, error }: { options: Pick<Vertical, 'name' | 'color'>[]; value?: string; onPick: (v: string) => void; error?: string }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 24px 8px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `1px solid ${error ? '#F87171' : P.border}`, borderRadius: 8, padding: 3 }}>
          {options.map(({ name: v, color }) => {
            const active = value === v
            return (
              <button key={v} type="button" onClick={() => onPick(v)}
                style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: active ? 700 : 500, transition: 'all .15s', border: 'none', background: active ? color : 'transparent', color: active ? '#fff' : '#5C5C5C', whiteSpace: 'nowrap' }}>
                {v}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, padding: '0 20px', height: 3 }}>
        {options.map(({ name: v, color }) => (
          <div key={v} style={{ flex: 1, background: color, borderRadius: 2, opacity: value === v ? 1 : 0.35, transition: 'opacity .2s' }} />
        ))}
      </div>
      {error && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#EF4444', textAlign: 'center' }}>{error}</p>}
    </div>
  )
}


/** Required-fields progress as a small ring with the count in the middle. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 17, c = 2 * Math.PI * r
  const pct = total ? done / total : 1
  const complete = done === total
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      <svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke={P.gridLine} strokeWidth={5} />
        <circle cx={22} cy={22} r={r} fill="none" stroke={complete ? P.teal : P.gold} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .3s, stroke .3s' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: BEBAS, ...CRISP, fontSize: 14, letterSpacing: '0.02em', color: complete ? P.teal : P.navy }}>
        {done}/{total}
      </span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewSalePage() {
  const compact = useCompact()
  const { verticals, reload: reloadVerticals } = useVerticals()
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

  // A vertical's DIDs are the ones whose campaign is that vertical; "Other" has none
  const selectedVertical = verticals.find(v => v.name === form.vertical_type)
  const isOther = !!selectedVertical?.isOther
  const campaign = form.vertical_type && !isOther ? form.vertical_type : ''
  const campaignRef = useRef(campaign)
  campaignRef.current = campaign  // a reply for a vertical the agent has since left is dropped
  useEffect(() => {
    setForm(p => ({ ...p, client_id: '' }))
    setDids([])
    if (!campaign) return
    setDidsLoading(true)
    apiGet<DidOption[]>('/clients/dropdown', { campaign })
      .then(list => { if (campaignRef.current === campaign) setDids(list) })
      .catch(() => setDids([]))
      .finally(() => setDidsLoading(false))
  }, [campaign])

  // Live refresh keeps the vertical pills and DID tiles current while the agent types; the form and
  // the picked DID stay, unless that DID has just been taken off the list.
  useAutoRefresh(() => Promise.all([
    reloadVerticals(),
    campaign && apiGet<DidOption[]>('/clients/dropdown', { campaign }).then(list => {
      if (campaignRef.current !== campaign) return
      setDids(list)
      setForm(p => (p.client_id && !list.some(d => String(d.id) === String(p.client_id)) ? { ...p, client_id: '' } : p))
    }).catch(() => {}),
  ]))

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
  const needsDid = !!form.vertical_type && !isOther && !!didField

  // Progress across every required field, including vertical and DID
  const requiredKeys = useMemo(() => {
    const keys = (config ?? []).filter(f => f.isRequired && f.fieldKey !== 'vertical_type' && f.fieldKey !== 'client_id' && f.fieldKey !== 'vertical_other').map(f => f.fieldKey)
    if (verticalRequired) keys.unshift('vertical_type')
    if (needsDid) keys.splice(1, 0, 'client_id')
    return keys
  }, [config, verticalRequired, needsDid])
  const doneCount = requiredKeys.filter(k => filled(form[k])).length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    // The vertical is picked with pills, so check it here instead of relying on the browser
    if (verticalRequired && !form.vertical_type) {
      setErrors({ vertical_type: ['Please select a vertical.'] })
      setToast({ message: 'Please select a vertical before submitting.', type: 'error' })
      return
    }
    if (form.vertical_type && !isOther && !form.client_id) {
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

  // Teal until a vertical is picked
  const vColor = selectedVertical?.color ?? FALLBACK_COLOR
  const verticalOptions = verticals.filter(v => v.isActive)
  const selectedDid = dids.find(d => d.id === form.client_id)
  const customer = [form.first_name, form.last_name].filter(filled).join(' ')
  const address = [form.address, form.city, [form.state, form.postal_code].filter(filled).join(' ')].filter(filled).join(', ')
  const stats = (list: FormField[]) => {
    const req = list.filter(f => f.isRequired)
    const done = req.filter(f => filled(form[f.fieldKey])).length
    return { done, total: req.length, complete: req.length > 0 && done === req.length }
  }

  // ── DID card ────────────────────────────────────────────────────────────────
  const didCard = (
    <SectionCard style={{ flex: 1 }} title={isOther ? `${form.vertical_type} Vertical` : didField?.label ?? 'Select DID'} icon={ICONS.phone}
      done={form.client_id || isOther ? 1 : 0} total={form.vertical_type ? 1 : 0}
      complete={isOther ? true : filled(form.client_id)}>
      {!form.vertical_type ? (
        <div style={{ flex: 1, minHeight: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, border: `2px dashed ${P.border}`, borderRadius: 12, color: P.textMuted }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>↑</span>
          <span style={{ fontFamily: RAJDHANI, fontSize: 15, fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center' }}>Pick a vertical above to see its DIDs</span>
        </div>
      ) : isOther ? (
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
          {/* Compact DID tiles, about five per row; the chosen one fills with the vertical's colour */}
          <div style={{ maxHeight: 112, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: 7, alignContent: 'start', padding: '5px 5px 1px 1px' }}>
            {dids.map(d => {
              const on = form.client_id === d.id
              return (
                <button key={d.id} type="button" onClick={() => set(asEvent('client_id', d.id))}
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 4px 6px',
                    borderRadius: 9, cursor: 'pointer', transition: 'all .15s', fontFamily: FONT,
                    border: `1.5px solid ${on ? vColor : P.border}`,
                    background: on ? `linear-gradient(145deg, ${vColor} 0%, ${P.navy} 150%)` : '#fff',
                    color: on ? '#fff' : P.navy, boxShadow: on ? `0 8px 16px -10px ${vColor}` : 'none',
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.borderColor = vColor }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.borderColor = P.border }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ display: 'flex', color: on ? '#fff' : vColor }}><Svg d={ICONS.phone} size={9} /></span>
                    <span style={{ fontFamily: BEBAS, ...CRISP, fontSize: 17, letterSpacing: '0.06em', lineHeight: 1 }}>{d.didCode}</span>
                  </span>
                  {d.saleType && <SaleTypeBadge type={d.saleType} light={on} small />}
                  {on && (
                    <span style={{ position: 'absolute', top: -5, right: -5, width: 15, height: 15, borderRadius: '50%', background: '#fff', border: `1.5px solid ${vColor}`, color: vColor, fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                  )}
                </button>
              )
            })}
          </div>
          <p style={{ margin: '6px 0 0', fontFamily: RAJDHANI, fontSize: 13, fontWeight: 600, color: P.textMuted, flexShrink: 0 }}>
            {dids.length} DID{dids.length !== 1 ? 's' : ''} available for {form.vertical_type}
          </p>
          {err('client_id') && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#EF4444' }}>{err('client_id')}</p>}
        </>
      )}
    </SectionCard>
  )

  // ── Summary bar (horizontal, under the pills) ──────────────────────────────
  const divider = <div style={{ width: 1, alignSelf: 'stretch', background: P.border, margin: '12px 0', flexShrink: 0 }} />
  const summary = (
    <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: compact ? 'wrap' : 'nowrap', background: '#fff', borderRadius: 14, overflow: 'hidden', margin: '12px 0', flexShrink: 0, border: `1px solid ${P.border}`, boxShadow: '0 8px 22px -18px rgba(19,46,87,0.6)' }}>
      {/* Customer block shaded in the vertical's colour, fading out to the right */}
      {/* A long, horizontal fade with several stops so it melts into the white instead of ending in an edge */}
      <div style={{ padding: '10px 120px 10px 20px', minWidth: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#fff',
        background: `linear-gradient(90deg, ${vColor} 0%, ${vColor} 42%, ${withAlpha(vColor, 0.88)} 54%, ${withAlpha(vColor, 0.62)} 66%, ${withAlpha(vColor, 0.36)} 77%, ${withAlpha(vColor, 0.16)} 87%, ${withAlpha(vColor, 0.05)} 94%, ${withAlpha(vColor, 0)} 100%)`,
        transition: 'background .3s' }}>
        <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 10, letterSpacing: '0.05em', opacity: 0.9 }}>SALE SUMMARY</p>
        <p style={{ margin: '3px 0 0', fontFamily: BEBAS, ...CRISP, fontSize: 22, letterSpacing: '0.05em', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{customer || 'New Customer'}</p>
        <p style={{ margin: '1px 0 0', fontSize: 12, opacity: 0.85 }}>{form.phone || 'No phone yet'}</p>
      </div>
      <SummaryItem icon={ICONS.tag} color={vColor} label="Vertical">
        {form.vertical_type
          ? <span style={{ padding: '1px 10px', borderRadius: 99, fontSize: 12, color: '#fff', background: vColor }}>{isOther && filled(form.vertical_other) ? form.vertical_other : form.vertical_type}</span>
          : <NotSet />}
      </SummaryItem>
      {!isOther && (
        <SummaryItem icon={ICONS.phone} color={vColor} label="DID">
          {selectedDid ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BEBAS, ...CRISP, fontSize: 17, letterSpacing: '0.05em' }}>{selectedDid.didCode}{selectedDid.saleType && <SaleTypeBadge type={selectedDid.saleType} small />}</span> : <NotSet />}
        </SummaryItem>
      )}
      <SummaryItem icon={ICONS.address} color={vColor} label="Address" grow>{address || <NotSet />}</SummaryItem>
      {divider}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', flexShrink: 0 }}>
        <ProgressRing done={doneCount} total={requiredKeys.length} />
        <span style={{ fontFamily: RAJDHANI, fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.15 }}>Required<br />fields</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginLeft: 'auto', flexShrink: 0 }}>
        <button type="button" onClick={resetForm}
          style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${withAlpha(P.brick, 0.3)}`, background: withAlpha(P.brick, 0.1), color: P.brick, fontFamily: RAJDHANI, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = withAlpha(P.brick, 0.18) }}
          onMouseLeave={e => { e.currentTarget.style.background = withAlpha(P.brick, 0.1) }}>
          Reset
        </button>
        <button type="submit" form="new-sale-form" disabled={loading}
          style={{ padding: '9px 26px', borderRadius: 10, border: 0, background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', fontFamily: BEBAS, ...CRISP, fontSize: 20, letterSpacing: '0.12em', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1, boxShadow: '0 10px 22px -12px rgba(30,132,150,0.9)', whiteSpace: 'nowrap' }}>
          {loading ? 'Submitting...' : 'Record Sale'}
        </button>
      </div>
    </div>
  )

  /**
   * A section's fields, laid out by their Width setting. Textarea fields go below the others
   * and stretch to fill the rest of the card.
   */
  const sectionBody = (list: FormField[]) => {
    const field = (f: FormField, fill?: boolean) => (
      <Field key={f.fieldKey} label={f.label} required={f.isRequired} error={err(f.fieldKey)} fill={fill}>
        <GenericField field={f} value={form[f.fieldKey] ?? ''} onChange={set} error={err(f.fieldKey)} fill={fill} />
      </Field>
    )
    const fills = list.filter(isFillField)
    const others = list.filter(f => !isFillField(f))
    if (!compact && fills.length && others.length) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.6rem 0.75rem' }}>
            {others.map(f => <div key={f.fieldKey} style={{ gridColumn: `span ${COL_SPAN[f.colSpan] ?? 2}` }}>{field(f)}</div>)}
          </div>
          {fills.map(f => field(f, true))}
        </div>
      )
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.7rem 0.75rem', alignContent: 'start' }}>
        {list.map(f => (
          <div key={f.fieldKey} style={{ gridColumn: `span ${compact ? 6 : COL_SPAN[f.colSpan] ?? 2}` }}>{field(f)}</div>
        ))}
      </div>
    )
  }

  // Grid of six columns: DID takes 2 and the first section 4, then the remaining sections two per row
  const rest = sections.order.length - 1
  const rowCount = 1 + Math.ceil(Math.max(rest, 0) / 2)
  const spanFor = (i: number) => {
    if (compact) return '1 / -1'
    if (i === 0) return 'span 4'
    return rest % 2 === 1 && i === sections.order.length - 1 ? '1 / -1' : 'span 3'
  }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {/* Fills the screen height on desktop; the card rows share whatever space is left */}
      <div style={{ padding: '0 20px 16px', minHeight: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: P.bgMain, fontFamily: FONT }}>
        <VerticalPills options={verticalOptions} value={form.vertical_type} onPick={v => set(asEvent('vertical_type', v))} error={err('vertical_type')} />

        {summary}

        <form id="new-sale-form" onSubmit={handleSubmit}
          style={{ flex: 1, display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'repeat(6, minmax(0, 1fr))', gridTemplateRows: compact ? undefined : `repeat(${rowCount - 1}, auto) 1fr`, gap: 12 }}>
          <div style={{ gridColumn: compact ? '1 / -1' : 'span 2', display: 'flex', minWidth: 0 }}>{didCard}</div>

          {sections.order.map((name, i) => {
            const list = sections.map[name]
            const s = stats(list)
            return (
              <SectionCard key={name} title={name} icon={sectionIcon(name)} done={s.done} total={s.total} complete={s.complete}
                style={{ gridColumn: spanFor(i) }}>
                {sectionBody(list)}
              </SectionCard>
            )
          })}
        </form>
      </div>
    </>
  )
}
