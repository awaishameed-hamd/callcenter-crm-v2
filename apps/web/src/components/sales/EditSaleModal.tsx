'use client'

// Edit and delete a sale from the Sales Report (managers and above). Same fields and look as
// editing on the Approvals page; the approval status itself is not changed here.

import { useEffect, useState } from 'react'
import { CANCEL_REASONS } from '@crm/shared'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { useVerticals } from '@/lib/verticals'
import { apiDelete, apiGet, apiPut, errMsg } from '@/lib/api'
import { P } from '@/lib/palette'
import type { Customer } from '@/types'
import { FONT, BEBAS, CRISP, RAJDHANI, ETHNO, inputCls, withAlpha, ICONS, Field, SectionCard, INFO_GRID } from './saleUi'

type Form = Record<string, string>
type DidOption = { id: string; didCode: string; saleType: string | null }

const toForm = (c: Customer): Form => ({
  firstName: c.firstName ?? '', midName: c.midName ?? '', lastName: c.lastName ?? '',
  dateOfBirth: c.dateOfBirth?.slice(0, 10) ?? '', phone: c.phone ?? '',
  address: c.address ?? '', city: c.city ?? '', state: c.state ?? '', postalCode: c.postalCode ?? '',
  verticalType: c.verticalType ?? '', verticalOther: c.verticalOther ?? '', clientId: c.clientId ?? '',
  didComments: c.didComments ?? '', transferredFrom: c.transferredFrom ?? '', reason: c.reason ?? '',
  qaComments: c.qaComments ?? '',
})

const fullName = (c: Customer) => [c.firstName, c.midName, c.lastName].filter(Boolean).join(' ')

const btn = (bg: string, color = '#fff', border?: string): React.CSSProperties => ({
  padding: '6px 13px', borderRadius: 8, border: border ? `1px solid ${border}` : 0, background: bg, color, cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
})
const TEAL_BTN = `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`
const RED_BTN  = 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)'

/** Slim header whose colour fades out to the right, as the Approvals dialogs. */
function Head({ color, title, sub, onClose }: { color: string; title: string; sub: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '11px 20px', color: '#fff', flexShrink: 0,
      background: `linear-gradient(90deg, ${color} 0%, ${color} 30%, ${withAlpha(color, 0.78)} 55%, ${withAlpha(color, 0.45)} 78%, ${withAlpha(color, 0.18)} 100%)` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 10, letterSpacing: '0.05em', opacity: 0.9 }}>SALES REPORT</p>
        <p style={{ margin: '3px 0 0', display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ fontFamily: BEBAS, ...CRISP, fontSize: 22, letterSpacing: '0.05em', lineHeight: 1.05 }}>{title}</span>
          <span style={{ fontSize: 12, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
        </p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.navy, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>×</button>
    </div>
  )
}

function Shell({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45" style={{ backdropFilter: 'blur(2px)' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: width, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(19,46,87,0.45)', fontFamily: FONT }}>
        {children}
      </div>
    </div>
  )
}

export function EditSaleModal({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: (c: Customer) => void }) {
  const { verticals } = useVerticals()
  const [form, setForm] = useState<Form>(() => toForm(customer))
  const [dids, setDids] = useState<DidOption[]>([])
  const [didsLoading, setDidsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isOther = (name?: string) => !!verticals.find(v => v.name === name)?.isOther
  useEffect(() => {
    const campaign = form.verticalType && !isOther(form.verticalType) ? form.verticalType : ''
    if (!campaign) { setDids([]); return }
    setDidsLoading(true)
    apiGet<DidOption[]>('/clients/dropdown', { campaign }).then(setDids).catch(() => setDids([])).finally(() => setDidsLoading(false))
  }, [form.verticalType, verticals]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (name: string, value: string) => setForm(p => (name === 'verticalType' ? { ...p, verticalType: value, clientId: '' } : { ...p, [name]: value }))
  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.name, e.target.value)
  const inp = (name: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input name={name} value={form[name] ?? ''} onChange={onChange} className={inputCls} {...extra} />

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('First and last name are required.'); return }
    setSaving(true); setError('')
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))
      const { customer: saved } = await apiPut<{ customer: Customer }>(`/customers/${customer.id}`, payload)
      onSaved(saved)
    } catch (e) { setError(errMsg(e, 'Could not save the changes.')) }
    finally { setSaving(false) }
  }

  // The current DID stays selectable even if it has since been turned off
  const didOptions = [
    ...(customer.client && customer.clientId && !dids.some(d => d.id === customer.clientId) && form.verticalType === customer.verticalType
      ? [{ value: customer.clientId, label: customer.client.didCode ?? 'Current DID' }] : []),
    ...dids.map(d => ({ value: d.id, label: `${d.didCode}${d.saleType ? ` (${d.saleType})` : ''}` })),
  ]

  return (
    <Shell width={980}>
      <Head color={P.teal} title="Edit Sale" sub={fullName(customer)} onClose={onClose} />
      <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, background: P.bgMain }}>
        {error && <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SectionCard title="Personal Information" icon={ICONS.person} done={0} total={0} complete={false}>
            <div style={INFO_GRID}>
              <Field label="First Name" required>{inp('firstName', { placeholder: 'First name' })}</Field>
              <Field label="Middle Name">{inp('midName', { placeholder: 'Middle name' })}</Field>
              <Field label="Last Name" required>{inp('lastName', { placeholder: 'Last name' })}</Field>
              <Field label="Date of Birth"><DateInput name="dateOfBirth" value={form.dateOfBirth} onChange={onChange} className={inputCls} /></Field>
              <div style={{ gridColumn: 'span 2' }}><Field label="Phone">{inp('phone', { type: 'tel', placeholder: 'Phone' })}</Field></div>
            </div>
          </SectionCard>
          <SectionCard title="Address" icon={ICONS.address} done={0} total={0} complete={false}>
            <div style={INFO_GRID}>
              <Field label="City">{inp('city', { placeholder: 'City' })}</Field>
              <Field label="State">{inp('state', { placeholder: 'State' })}</Field>
              <Field label="ZIP">{inp('postalCode', { placeholder: 'ZIP' })}</Field>
              <div style={{ gridColumn: '1 / -1' }}><Field label="Street Address">{inp('address', { placeholder: 'Street address' })}</Field></div>
            </div>
          </SectionCard>
          <SectionCard title="Sale Details" icon={ICONS.tag} done={0} total={0} complete={false}>
            <div style={INFO_GRID}>
              <div style={{ gridColumn: 'span 2' }}>
                <Field label="Vertical Type">
                  <StyledSelect value={form.verticalType} onChange={v => set('verticalType', v)} placeholder="Select"
                    options={verticals.filter(v => v.isActive || v.name === customer.verticalType).map(v => ({ value: v.name, label: v.name }))} />
                </Field>
              </div>
              {isOther(form.verticalType) && <Field label="Specify Other">{inp('verticalOther', { placeholder: 'Specify' })}</Field>}
              {form.verticalType && !isOther(form.verticalType) && (
                <Field label="DID">
                  <StyledSelect value={form.clientId} onChange={v => set('clientId', v)} loading={didsLoading} placeholder="Select DID" options={didOptions} />
                </Field>
              )}
            </div>
          </SectionCard>
          <SectionCard title="Additional Information" icon={ICONS.notes} done={0} total={0} complete={false}>
            <div style={INFO_GRID}>
              <Field label="Transferred From">{inp('transferredFrom', { placeholder: 'Transferred from' })}</Field>
              <div style={{ gridColumn: 'span 2' }}>
                <Field label="Reason of Cancellation">
                  <StyledSelect value={form.reason} onChange={v => set('reason', v)} placeholder="Select reason"
                    options={[{ value: '', label: 'No reason' }, ...CANCEL_REASONS.map(r => ({ value: r, label: r })), ...(form.reason && !(CANCEL_REASONS as readonly string[]).includes(form.reason) ? [{ value: form.reason, label: form.reason }] : [])]} />
                </Field>
              </div>
            </div>
          </SectionCard>
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SectionCard title="Comments" icon={ICONS.notes} done={0} total={0} complete={false}>
              <textarea name="didComments" value={form.didComments} onChange={onChange} rows={3} placeholder="Comments" className={`${inputCls} resize-none`} />
            </SectionCard>
            <SectionCard title="QA Comments" icon={ICONS.notes} done={0} total={0} complete={false}>
              <textarea name="qaComments" value={form.qaComments} onChange={onChange} rows={3} placeholder="QA comments" className={`${inputCls} resize-none`} />
            </SectionCard>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: `1px solid ${P.border}`, background: '#FAFBFC' }}>
        <button type="button" onClick={onClose} style={btn('#fff', P.navy, P.border)}>Cancel</button>
        <button type="button" onClick={save} disabled={saving} style={{ ...btn(TEAL_BTN), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving' : 'Save Changes'}</button>
      </div>
    </Shell>
  )
}

export function DeleteSaleModal({ customer, onClose, onDeleted }: { customer: Customer; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function go() {
    setBusy(true); setError('')
    try { await apiDelete(`/customers/${customer.id}`); onDeleted() }
    catch (e) { setError(errMsg(e, 'Could not delete the sale.')) }
    finally { setBusy(false) }
  }
  return (
    <Shell width={440}>
      <Head color="#DC2626" title="Delete Sale" sub={fullName(customer)} onClose={onClose} />
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div style={{ padding: '9px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
        <p style={{ margin: 0, fontSize: 13, color: P.slate, lineHeight: 1.55 }}>
          Delete the sale of <strong style={{ color: P.navy }}>{fullName(customer)}</strong>{customer.phone ? <> ({customer.phone})</> : null}? It is removed from reports and the dashboard, and this cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button type="button" onClick={onClose} style={btn('#fff', P.navy, P.border)}>Cancel</button>
          <button type="button" onClick={go} disabled={busy} style={{ ...btn(RED_BTN), opacity: busy ? 0.6 : 1 }}>{busy ? 'Deleting' : 'Delete Sale'}</button>
        </div>
      </div>
    </Shell>
  )
}
