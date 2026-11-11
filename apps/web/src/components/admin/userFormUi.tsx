'use client'

// The create/edit user popup's look, shared by My Team (create and edit any user) and Profile
// (each person editing their own details): the window, grey-headed section cards, labels and the
// field boxes drawn from CRM Management's user form. Fields only HR may change show locked.

import { DEPARTMENTS } from '@crm/shared'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import BankFields from '@/components/ui/BankFields'
import { P } from '@/lib/palette'
import { fmtDay } from '@/lib/format'
import type { FormField } from '@/types'

export const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
// Create/edit user modal styles, copied from argroup's UserProfileModal
export const inputCls  = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed'
export const iStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none',
  color: P.textHeading, fontFamily: '"Aptos", sans-serif', boxSizing: 'border-box',
}
export const readOnlyStyle: React.CSSProperties = { ...iStyle, background: '#F8FAFC', color: P.teal, fontWeight: 700, letterSpacing: '0.06em' }
export const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}
export const roleName = (r: string) => r.charAt(0) + r.slice(1).toLowerCase()

export function formatCNIC(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (d.length <= 5) return d
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}
export function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm" style={{ overflow: 'visible' }}>
      <div className="px-5 py-2.5 border-b border-gray-200" style={{ background: 'linear-gradient(90deg, #E4E9F0, #EDF0F5)', borderRadius: '12px 12px 0 0' }}>
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: P.textMuted }}>{title}</h3>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(19,46,87,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: '#F8FAFC', borderRadius: 18, width: '100%', maxWidth: 780, boxShadow: '0 32px 80px rgba(0,0,0,0.3)', marginBottom: 24 }}>
        <div style={{ padding: '18px 28px', borderBottom: `1px solid ${P.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #DDE3EC 0%, #D0D8E4 100%)', borderRadius: '18px 18px 0 0' }}>
          <h2 style={{ margin: 0, fontFamily: '"Aptos", sans-serif', fontSize: 18, fontWeight: 900, color: P.navy, letterSpacing: '0.04em' }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 24, color: P.textMuted, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function DynamicField({ field, value, onChange, error, plain, locked }: { field: FormField; value: string; onChange: (k: string, v: string) => void; error?: string; plain?: boolean; locked?: boolean }) {
  if (locked) return (
    <div style={plain ? undefined : { gridColumn: `span ${COL_SPAN[field.colSpan] ?? 2}` }}>
      <Field label={field.label}><LockedValue value={lockedText(field, value)} /></Field>
    </div>
  )
  const err = error ? 'border-red-400' : ''
  const handle = (e: React.ChangeEvent<any>) => onChange(field.fieldKey, e.target.value)
  // Bank: chosen from HR's list (its Bank Code is only in the server's banking export)
  if (field.fieldKey === 'bank') return (
    <div style={plain ? undefined : { gridColumn: `span ${COL_SPAN[field.colSpan] ?? 2}`, minWidth: 0 }}>
      <BankFields value={value} onChange={v => onChange('bank', v)} label={field.label} required={field.isRequired} error={error}
        Field={p => <Field label={p.label} required={p.required} error={p.error}>{p.children}</Field>} />
    </div>
  )
  let input: React.ReactNode
  if (field.fieldKey === 'cnic') {
    input = (
      <>
        <input type="text" value={value} onChange={e => onChange(field.fieldKey, formatCNIC(e.target.value))} placeholder={field.placeholder ?? '00000-0000000-0'} maxLength={15} className={`${inputCls} ${err}`} />
        <p className="mt-1 text-xs text-gray-400">Format: XXXXX-XXXXXXX-X</p>
      </>
    )
  } else if (field.fieldType === 'select') {
    const opts = field.options ?? (field.fieldKey === 'department' ? DEPARTMENTS : [])
    input = (
      <StyledSelect value={value} onChange={v => onChange(field.fieldKey, v)} placeholder={`Select ${field.label}`}
        borderColor={error ? '#f87171' : undefined} options={opts.map(o => ({ value: o, label: o }))} />
    )
  } else if (field.fieldType === 'date') {
    input = <DateInput value={value} onChange={handle} className={`${inputCls} ${err}`} />
  } else if (field.fieldType === 'textarea') {
    input = <textarea value={value} onChange={handle} rows={field.textareaRows || 2} placeholder={field.placeholder ?? ''} className={`${inputCls} resize-none ${err}`} />
  } else if (field.fieldType === 'amount_pkr' || field.fieldType === 'amount_usd') {
    input = (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold select-none">{field.fieldType === 'amount_pkr' ? '₨' : '$'}</span>
        <input type="number" min={0} step="0.01" value={value} onChange={handle} placeholder={field.placeholder ?? '0.00'} className={`${inputCls} pl-7 ${err}`} />
      </div>
    )
  } else if (field.fieldType === 'number') {
    input = <input type="number" value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={`${inputCls} ${err}`} />
  } else {
    const t = field.fieldKey === 'email' ? 'email' : field.fieldKey === 'phone' ? 'tel' : 'text'
    input = <input type={t} value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={`${inputCls} ${err}`} />
  }
  return (
    <div style={plain ? undefined : { gridColumn: `span ${COL_SPAN[field.colSpan] ?? 2}` }}>
      <Field label={field.label} required={field.isRequired} error={error}>{input}</Field>
    </div>
  )
}

/** How a locked value reads: dates in words, salary in rupees. */
function lockedText(field: FormField, value: string) {
  if (!value) return ''
  if (field.fieldType === 'date') return fmtDay(value.slice(0, 10))
  if (field.fieldType === 'amount_pkr') return Number(value) ? `PKR ${Number(value).toLocaleString('en-PK')}` : ''
  return value
}

/** A value the person can see but not change (set by HR), with a small lock. */
export function LockedValue({ value, title = 'Managed by HR' }: { value: string; title?: string }) {
  return (
    <div title={title} style={{ ...iStyle, background: '#F1F5F9', color: value ? '#475569' : '#94A3B8', display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, cursor: 'not-allowed' }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || 'Not set'}</span>
      <svg width={13} height={13} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#94A3B8" style={{ flexShrink: 0 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    </div>
  )
}
