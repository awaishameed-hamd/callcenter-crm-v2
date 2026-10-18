'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Toast from '@/components/ui/Toast'
import StyledSelect from '@/components/ui/StyledSelect'
import AttendanceSettings from '@/components/settings/AttendanceSettings'
import AttendanceApplicabilitySettings from '@/components/settings/AttendanceApplicabilitySettings'
import { apiGet, apiPost, apiPut, apiDelete, errMsg, errFields } from '@/lib/api'
import type { FormField, User } from '@/types'
import { PageTitle } from '@/components/ui/PageChrome'
import DataTable from '@/components/ui/DataTable'
import { P } from '@/lib/palette'
import { useLayout } from '@/components/layout/AppLayout'

const NAVY  = P.navy
const TEAL  = P.teal
const BG    = P.bgMain
const WHITE = '#FFFFFF'
// Same teal gradient as the primary buttons everywhere else in the CRM
const GRAD  = `linear-gradient(135deg, ${TEAL} 0%, #0E5F6E 100%)`
// Gold table header used by DataTable
const TH_ROW: React.CSSProperties = { background: P.gold, color: '#1a1a1a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }

const FIELD_TYPES = [
  { value: 'text',       label: 'Text' },
  { value: 'number',     label: 'Number' },
  { value: 'select',     label: 'Select' },
  { value: 'date',       label: 'Date' },
  { value: 'textarea',   label: 'Textarea' },
  { value: 'amount_usd', label: 'Amount (USD)' },
  { value: 'amount_pkr', label: 'Amount (PKR)' },
]
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  text:       { bg: P.fillNavy,  color: P.navy },
  number:     { bg: P.fillGold,  color: '#8A6100' },
  select:     { bg: P.fillTeal,  color: P.teal },
  date:       { bg: '#F1E4F4',   color: P.purple },
  textarea:   { bg: P.fillBrick, color: P.brick },
  amount_usd: { bg: '#E3EEE3',   color: P.forest },
  amount_pkr: { bg: P.fillGold,  color: '#8A6100' },
}
const TYPE_LABELS: Record<string, string> = {
  text: 'Text', number: 'Number', select: 'Select', date: 'Date', textarea: 'Textarea', amount_usd: 'USD $', amount_pkr: 'PKR ₨',
}
const WIDTH_OPTS = [
  { value: 'full',       label: '100%' },
  { value: 'two_thirds', label: '2/3' },
  { value: 'half',       label: '1/2' },
  { value: 'third',      label: '1/3' },
]
const NO_PLACEHOLDER = ['select', 'date', 'amount_usd', 'amount_pkr']

type SetToast = (t: { type: 'success' | 'error'; message: string } | null) => void
type FieldDraft = {
  label: string; fieldKey: string; fieldType: string; placeholder: string; section: string
  colSpan: string; textareaRows: number; isVisible: boolean; isRequired: boolean; options: string[]
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const tc = TYPE_COLORS[type] ?? TYPE_COLORS.text
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap" style={{ background: tc.bg, color: tc.color }}>{TYPE_LABELS[type] ?? type}</span>
}

function CoreBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide"
      style={{ background: 'rgba(30,132,150,0.12)', color: TEAL, border: `1px solid ${TEAL}` }}>Core</span>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled} aria-checked={checked}
      className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none"
      style={{ background: checked ? TEAL : '#CBD5E1', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span className="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200" style={{ marginTop: 2, marginLeft: checked ? 18 : 2 }} />
    </button>
  )
}

function ArrowBtn({ dir, disabled, onClick }: { dir: 'up' | 'down'; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={dir === 'up' ? 'Move up' : 'Move down'}
      className="flex items-center justify-center rounded transition-colors"
      style={{
        width: 20, height: 20,
        background: disabled ? 'transparent' : '#F1F5F9',
        color: disabled ? '#CBD5E1' : '#64748B',
        cursor: disabled ? 'default' : 'pointer',
        border: disabled ? '1px solid transparent' : '1px solid #E2E8F0',
      }}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={dir === 'up' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
      </svg>
    </button>
  )
}

const EditIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
)
const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: TEAL }} />
  </div>
)
const Label = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: NAVY }}>{children}{req && <span className="text-red-500"> *</span>}</label>
)

function ModalShell({ title, subtitle, mono, width = 'max-w-md', onClose, children, footer }: {
  title: string; subtitle?: string; mono?: boolean; width?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className={`w-full ${width} rounded-2xl shadow-2xl overflow-hidden`} style={{ background: WHITE }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: GRAD }}>
          <div>
            <h3 className="text-lg font-black text-white" style={{ fontFamily: "'Aptos', sans-serif", letterSpacing: '0.04em' }}>{title}</h3>
            {subtitle && <p className={`text-xs text-white/60 mt-0.5 ${mono ? 'font-mono' : ''}`}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>
        {children}
        <div className="px-6 pb-5 flex gap-3 justify-end border-t border-gray-100 pt-4">{footer}</div>
      </div>
    </div>
  )
}

function OptionsEditor({ options, setOptions, error }: { options: string[]; setOptions: (o: string[]) => void; error?: string }) {
  const [newOption, setNewOption] = useState('')
  const add = () => { if (!newOption.trim()) return; setOptions([...options, newOption.trim()]); setNewOption('') }
  return (
    <div>
      <Label req>Options</Label>
      <div className="space-y-1.5 mb-2 max-h-36 overflow-y-auto">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-1 px-3 py-1.5 rounded-lg text-sm" style={{ background: '#F7F9FC', color: NAVY }}>{opt}</span>
            <button type="button" onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
              className="text-red-400 hover:text-red-600 font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50">×</button>
          </div>
        ))}
        {options.length === 0 && <p className="text-xs text-gray-400 italic">No options yet.</p>}
      </div>
      <div className="flex gap-2">
        <input type="text" value={newOption} onChange={e => setNewOption(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Type and press Enter"
          className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none" style={{ borderColor: error ? '#ef4444' : '#CBD5E1', color: NAVY }} />
        <button type="button" onClick={add} className="px-4 py-1.5 rounded-lg text-sm font-bold" style={{ background: GRAD, color: WHITE }}>+ Add</button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// Body shared by Add Field and Edit Field: section, label, type, width, placeholder, options, toggles.
function FieldFormBody({ form, setF, sections, errors, keyInput }: {
  form: FieldDraft; setF: <K extends keyof FieldDraft>(k: K, v: FieldDraft[K]) => void; sections: string[]
  errors: Record<string, string | undefined>; keyInput?: React.ReactNode
}) {
  const onType = (val: string) => {
    setF('fieldType', val)
    if (val === 'textarea') setF('colSpan', 'full')
    else if (form.colSpan === 'full') setF('colSpan', 'third')
  }
  const pill = (active: boolean) => ({ background: active ? GRAD : WHITE, color: active ? WHITE : NAVY, borderColor: active ? 'transparent' : '#CBD5E1' })
  return (
    <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
      <div>
        <Label>Section</Label>
        <StyledSelect value={form.section} onChange={v => setF('section', v)} options={sections.map(s => ({ value: s, label: s }))} />
      </div>
      <div>
        <Label req>Label</Label>
        <input type="text" value={form.label} onChange={e => setF('label', e.target.value)} placeholder="e.g. Customer ID"
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none" style={{ borderColor: errors.label ? '#ef4444' : '#CBD5E1', color: NAVY }} />
        {errors.label && <p className="text-xs text-red-500 mt-1">{errors.label}</p>}
      </div>
      {keyInput}
      <div>
        <Label req={!!keyInput}>Field Type</Label>
        <div className="flex gap-1.5 flex-wrap">
          {FIELD_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => onType(t.value)} className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-all" style={pill(form.fieldType === t.value)}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <Label>Width</Label>
          <div className="flex gap-1">
            {WIDTH_OPTS.map(w => (
              <button key={w.value} type="button" onClick={() => setF('colSpan', w.value)} className="flex-1 py-1 rounded-lg text-xs font-bold border transition-all" style={pill(form.colSpan === w.value)}>{w.label}</button>
            ))}
          </div>
        </div>
        {form.fieldType === 'textarea' && (
          <div style={{ width: 80 }}>
            <Label>Rows</Label>
            <input type="number" min={1} max={20} value={form.textareaRows} onChange={e => setF('textareaRows', parseInt(e.target.value) || 3)}
              className="w-full rounded-lg border px-2 py-1 text-sm text-center focus:outline-none" style={{ borderColor: '#CBD5E1', color: NAVY }} />
          </div>
        )}
      </div>
      {!NO_PLACEHOLDER.includes(form.fieldType) && (
        <div>
          <Label>Placeholder</Label>
          <input type="text" value={form.placeholder} onChange={e => setF('placeholder', e.target.value)} placeholder="e.g. Enter value"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none" style={{ borderColor: '#CBD5E1', color: NAVY }} />
        </div>
      )}
      {form.fieldType === 'select' && <OptionsEditor options={form.options} setOptions={o => setF('options', o)} error={errors.options} />}
      <div className="flex gap-6 pt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <Toggle checked={form.isVisible} onChange={v => { setF('isVisible', v); if (!v) setF('isRequired', false) }} />
          <span className="text-sm font-semibold" style={{ color: NAVY }}>Visible</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Toggle checked={form.isRequired} onChange={v => setF('isRequired', v)} disabled={!form.isVisible} />
          <span className="text-sm font-semibold" style={{ color: NAVY }}>Required</span>
        </label>
      </div>
    </div>
  )
}

function useFieldDraft(init: FieldDraft) {
  const [form, setForm] = useState<FieldDraft>(init)
  const setF = useCallback(<K extends keyof FieldDraft>(k: K, v: FieldDraft[K]) => setForm(f => ({ ...f, [k]: v })), [])
  return { form, setForm, setF }
}

const payloadOf = (form: FieldDraft) => ({
  label:        form.label.trim(),
  fieldType:    form.fieldType,
  placeholder:  !NO_PLACEHOLDER.includes(form.fieldType) ? (form.placeholder || null) : null,
  section:      form.section || null,
  colSpan:      form.colSpan,
  textareaRows: form.fieldType === 'textarea' ? (form.textareaRows || 3) : 3,
  isVisible:    form.isVisible,
  isRequired:   form.isVisible && form.isRequired,
  options:      form.fieldType === 'select' ? form.options : null,
})

const FooterButtons = ({ onClose, onSubmit, saving, label, busy }: { onClose: () => void; onSubmit: () => void; saving: boolean; label: string; busy: string }) => (
  <>
    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #CBD5E1', color: '#64748B' }}>Cancel</button>
    <button onClick={onSubmit} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-bold text-white"
      style={{ background: GRAD, opacity: saving ? 0.65 : 1, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.05em' }}>{saving ? busy : label}</button>
  </>
)

// ── Add Field Modal ───────────────────────────────────────────────────────────
function AddFieldModal({ defaultSection, sections, onAdd, onClose }: {
  defaultSection: string; sections: string[]; onAdd: (data: Record<string, unknown>) => Promise<void>; onClose: () => void
}) {
  const { form, setForm, setF } = useFieldDraft({
    label: '', fieldKey: '', fieldType: 'text', placeholder: '', section: defaultSection || sections[0] || '',
    colSpan: 'third', textareaRows: 3, isVisible: true, isRequired: false, options: [],
  })
  const [keyEdited, setKeyEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  const autoKey = (label: string) => label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '').slice(0, 50)

  const setDraft = <K extends keyof FieldDraft>(k: K, v: FieldDraft[K]) => {
    if (k === 'label') {
      setForm(f => ({ ...f, label: v as string, fieldKey: keyEdited ? f.fieldKey : autoKey(v as string) }))
      setErrors(e => ({ ...e, label: undefined }))
    } else setF(k, v)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.label.trim()) e.label = 'Label is required'
    if (!form.fieldKey.trim()) e.fieldKey = 'Field key is required'
    else if (!/^[a-z][a-z0-9_]*$/.test(form.fieldKey)) e.fieldKey = 'Must start with a letter; only a to z, 0 to 9 and underscores'
    if (form.fieldType === 'select' && form.options.length === 0) e.options = 'Add at least one option'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    try { await onAdd({ ...payloadOf(form), fieldKey: form.fieldKey, sortOrder: 9999 }) }
    catch { /* toast shown by parent */ }
    finally { setSaving(false) }
  }

  const keyInput = (
    <div>
      <Label req>Field Key / ID</Label>
      <input type="text" value={form.fieldKey}
        onChange={e => { setKeyEdited(true); setF('fieldKey', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 50)); setErrors(er => ({ ...er, fieldKey: undefined })) }}
        placeholder="e.g. customer_id" className="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none"
        style={{ borderColor: errors.fieldKey ? '#ef4444' : '#CBD5E1', color: '#475569' }} />
      {errors.fieldKey
        ? <p className="text-xs text-red-500 mt-1">{errors.fieldKey}</p>
        : <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers and underscores only.</p>}
    </div>
  )

  return (
    <ModalShell title="Add New Field" onClose={onClose} footer={<FooterButtons onClose={onClose} onSubmit={submit} saving={saving} label="Add Field" busy="Adding..." />}>
      <FieldFormBody form={form} setF={setDraft} sections={sections} errors={errors} keyInput={keyInput} />
    </ModalShell>
  )
}

// ── Edit Field Modal ──────────────────────────────────────────────────────────
function EditFieldModal({ field, sections, onSave, onClose }: {
  field: FormField; sections: string[]; onSave: (f: FormField) => Promise<void>; onClose: () => void
}) {
  const { form, setF } = useFieldDraft({
    label: field.label || '', fieldKey: field.fieldKey, fieldType: field.fieldType || 'text', placeholder: field.placeholder || '',
    section: field.section || sections[0] || '', colSpan: field.colSpan || 'third', textareaRows: field.textareaRows || 3,
    isVisible: field.isVisible ?? true, isRequired: field.isRequired ?? false, options: Array.isArray(field.options) ? [...field.options] : [],
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!form.label.trim()) e.label = 'Label is required'
    if (form.fieldType === 'select' && form.options.length === 0) e.options = 'Add at least one option'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try { await onSave({ ...field, ...payloadOf(form) }) }
    catch { /* toast shown by parent */ }
    finally { setSaving(false) }
  }

  return (
    <ModalShell title="Edit Field" subtitle={field.fieldKey} mono onClose={onClose} footer={<FooterButtons onClose={onClose} onSubmit={submit} saving={saving} label="Save Changes" busy="Saving..." />}>
      <FieldFormBody form={form} setF={setF} sections={sections} errors={errors} />
    </ModalShell>
  )
}

// ── Edit Options Modal ────────────────────────────────────────────────────────
function EditOptionsModal({ field, onSave, onClose }: { field: FormField; onSave: (o: string[]) => void; onClose: () => void }) {
  const [options, setOptions]     = useState<string[]>([...(field.options || [])])
  const [newOption, setNewOption] = useState('')
  const [editIdx, setEditIdx]     = useState<number | null>(null)
  const [editVal, setEditVal]     = useState('')

  const add = () => { if (!newOption.trim()) return; setOptions(o => [...o, newOption.trim()]); setNewOption('') }
  const commit = () => {
    if (!editVal.trim()) return
    setOptions(o => o.map((opt, i) => i === editIdx ? editVal.trim() : opt))
    setEditIdx(null)
  }

  return (
    <ModalShell title="Edit Options" subtitle={field.label} width="max-w-sm" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #CBD5E1', color: '#64748B' }}>Cancel</button>
        <button onClick={() => onSave(options)} className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: GRAD, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.05em' }}>Save Options</button>
      </>}>
      <div className="p-5">
        <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              {editIdx === i ? (
                <>
                  <input type="text" value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && commit()} autoFocus
                    className="flex-1 rounded-lg border px-2 py-1.5 text-sm focus:outline-none" style={{ borderColor: TEAL, color: NAVY }} />
                  <button onClick={commit} className="text-xs font-bold px-2 py-1 rounded" style={{ background: TEAL, color: WHITE }}>✓</button>
                  <button onClick={() => setEditIdx(null)} className="text-xs text-gray-400 px-1">✕</button>
                </>
              ) : (
                <>
                  <span className="flex-1 px-3 py-1.5 rounded-lg text-sm" style={{ color: NAVY, background: '#F7F9FC' }}>{opt}</span>
                  <button onClick={() => { setEditIdx(i); setEditVal(opt) }} className="text-blue-400 hover:text-blue-600 text-sm px-1">✎</button>
                  <button onClick={() => setOptions(o => o.filter((_, idx) => idx !== i))}
                    className="text-red-400 hover:text-red-600 font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50">×</button>
                </>
              )}
            </div>
          ))}
          {options.length === 0 && <p className="text-sm text-gray-400 text-center py-3 italic">No options. Add below.</p>}
        </div>
        <div className="flex gap-2">
          <input type="text" value={newOption} onChange={e => setNewOption(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="New option"
            className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none" style={{ borderColor: '#CBD5E1', color: NAVY }} />
          <button onClick={add} className="px-4 py-1.5 rounded-lg text-sm font-bold" style={{ background: GRAD, color: WHITE }}>+ Add</button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ name, hasFields, isFirst, isLast, onRename, onDelete, onMoveUp, onMoveDown }: {
  name: string; hasFields: boolean; isFirst: boolean; isLast: boolean
  onRename: (n: string) => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(name)
  const commit = () => { if (val.trim() && val.trim() !== name) onRename(val.trim()); setEditing(false) }

  return (
    <div className="flex items-center justify-between px-4 py-2.5" style={{ background: P.fillNavy, borderBottom: `1px solid ${P.border}` }}>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <ArrowBtn dir="up" disabled={isFirst} onClick={onMoveUp} />
          <ArrowBtn dir="down" disabled={isLast} onClick={onMoveDown} />
        </div>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: TEAL }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h7" />
        </svg>
        {editing ? (
          <input type="text" value={val} autoFocus onChange={e => setVal(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            className="rounded-lg border px-2 py-0.5 text-sm font-bold focus:outline-none focus:ring-2"
            style={{ color: NAVY, borderColor: TEAL, fontFamily: "'Aptos', sans-serif", minWidth: 180 }} />
        ) : (
          <span className="text-sm font-bold" style={{ color: NAVY, fontFamily: "'Aptos', sans-serif", letterSpacing: '0.03em' }}>{name}</span>
        )}
        <button onClick={() => { setEditing(true); setVal(name) }} className="text-gray-400 hover:text-gray-600" title="Rename section"><EditIcon className="w-3.5 h-3.5" /></button>
      </div>
      {!hasFields && <button onClick={onDelete} className="text-xs font-semibold px-2 py-1 rounded" style={{ color: '#ef4444' }}>Delete Section</button>}
    </div>
  )
}

// Column widths shared by the hint row and every field row.
const W = { arrows: 44, num: 24, label: 220, width: 132, type: 80, options: 80, visible: 64, required: 72, del: 36, edit: 36 }

function FieldRow({ field, index, count, onChange, onEditOptions, onDelete, onEdit, onMoveUp, onMoveDown }: {
  field: FormField; index: number; count: number; onChange: (c: Partial<FormField>) => void
  onEditOptions: () => void; onDelete: () => void; onEdit: () => void; onMoveUp: () => void; onMoveDown: () => void
}) {
  const width = field.colSpan || 'third'
  return (
    <div style={{ borderBottom: `1px solid ${P.border}50`, background: index % 2 === 0 ? WHITE : '#FAFCFC' }}>
      <div className="flex items-center px-4 py-2.5" style={{ gap: 8 }}>
        <div className="flex flex-col gap-0.5 flex-shrink-0" style={{ width: W.arrows }}>
          <ArrowBtn dir="up" disabled={index === 0} onClick={onMoveUp} />
          <ArrowBtn dir="down" disabled={index === count - 1} onClick={onMoveDown} />
        </div>
        <div className="flex-shrink-0 text-xs font-mono text-right" style={{ width: W.num, color: '#94A3B8' }}>{String(index + 1).padStart(2, '0')}</div>
        <div className="flex-shrink-0 space-y-1.5" style={{ width: W.label }}>
          <input type="text" value={field.label} onChange={e => onChange({ label: e.target.value })} placeholder="Field label"
            className="w-full rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 transition-colors"
            style={{ borderColor: '#CBD5E1', color: NAVY, fontFamily: "'Aptos', sans-serif", fontWeight: 600 }} />
          {!NO_PLACEHOLDER.includes(field.fieldType) && (
            <input type="text" value={field.placeholder || ''} onChange={e => onChange({ placeholder: e.target.value })} placeholder="Placeholder"
              className="w-full rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none transition-colors" style={{ borderColor: '#E2E8F0', color: '#64748B' }} />
          )}
        </div>
        <div className="flex-shrink-0 space-y-1" style={{ width: W.width }}>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: '#CBD5E1' }}>
            {WIDTH_OPTS.map(w => (
              <button key={w.value} type="button" onClick={() => onChange({ colSpan: w.value })} className="flex-1 text-xs font-bold py-1.5 transition-colors"
                style={{ background: width === w.value ? NAVY : WHITE, color: width === w.value ? WHITE : P.slate, borderRight: w.value !== 'third' ? `1px solid ${P.border}` : 'none' }}>
                {w.label}
              </button>
            ))}
          </div>
          {field.fieldType === 'textarea' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: '#94A3B8' }}>Rows:</span>
              <input type="number" min={1} max={20} value={field.textareaRows || 3}
                onChange={e => onChange({ textareaRows: Math.max(1, Math.min(20, parseInt(e.target.value) || 3)) })}
                className="rounded-lg border px-1.5 py-1 text-xs text-center focus:outline-none" style={{ width: 44, borderColor: '#CBD5E1', color: NAVY }} />
            </div>
          )}
        </div>
        <div className="flex-shrink-0" style={{ width: W.type }}><TypeBadge type={field.fieldType} /></div>
        <div className="flex-shrink-0" style={{ width: W.options }}>
          {field.fieldType === 'select' ? (
            <button onClick={onEditOptions} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors hover:border-teal-400"
              style={{ color: TEAL, borderColor: 'rgba(30,132,150,0.35)', background: 'rgba(30,132,150,0.06)' }}>
              <EditIcon className="w-3 h-3" />{field.options?.length ?? 0} opts
            </button>
          ) : <span className="text-xs font-semibold" style={{ color: '#CBD5E1' }}>N/A</span>}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5" style={{ width: W.visible }}>
          <Toggle checked={!!field.isVisible} disabled={field.isCore} onChange={v => onChange({ isVisible: v, isRequired: v ? field.isRequired : false })} />
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5" style={{ width: W.required }}>
          <Toggle checked={field.isRequired} disabled={!field.isVisible} onChange={v => onChange({ isRequired: v })} />
        </div>
        <div className="flex-shrink-0 flex justify-center" style={{ width: W.del }}>
          {field.isCore ? <CoreBadge /> : (
            <button onClick={onDelete} title="Delete field" className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-red-400 hover:bg-red-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex-shrink-0 flex justify-center" style={{ width: W.edit }}>
          <button onClick={onEdit} title="Edit field" className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-blue-500 hover:bg-blue-50"><EditIcon /></button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Form Management Tab (Sale / Client / Profile)
// ════════════════════════════════════════════════════════════════════════════
const toUpdate = (f: FormField, sortOrder: number) => ({
  fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType, placeholder: f.placeholder ?? null, isVisible: !!f.isVisible,
  isRequired: !!f.isVisible && f.isRequired, sortOrder, section: f.section ?? null, options: f.options ?? null,
  colSpan: f.colSpan ?? 'third', textareaRows: f.textareaRows ?? 3,
})

function FormManagementTab({ formType, formLabel, setToast }: { formType: string; formLabel: string; setToast: SetToast }) {
  const [fields, setFields]             = useState<FormField[]>([])
  const [sectionOrder, setSectionOrder] = useState<string[]>([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [addFieldModal, setAddFieldModal]       = useState<{ section: string } | null>(null)
  const [editFieldModal, setEditFieldModal]     = useState<FormField | null>(null)
  const [editOptionsModal, setEditOptionsModal] = useState<FormField | null>(null)
  const [showAddSection, setShowAddSection]     = useState(false)
  const [newSectionName, setNewSectionName]     = useState('')

  const loadFields = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<FormField[]>('/crm/form-fields', { formType })
      setFields(data)
      const order: string[] = []
      data.forEach(f => { const s = f.section || 'General'; if (!order.includes(s)) order.push(s) })
      setSectionOrder(order)
    } catch {
      setToast({ type: 'error', message: 'Failed to load form fields.' })
    } finally { setLoading(false) }
  }, [formType, setToast])

  useEffect(() => { loadFields() }, [loadFields])

  const grouped = useMemo(() => {
    const map: Record<string, FormField[]> = {}
    sectionOrder.forEach(s => { map[s] = [] })
    fields.forEach(f => { const s = f.section || 'General'; (map[s] ??= []).push(f) })
    return map
  }, [fields, sectionOrder])

  const updateField = (fieldKey: string, changes: Partial<FormField>) =>
    setFields(fs => fs.map(f => f.fieldKey === fieldKey ? { ...f, ...changes } : f))

  const moveField = (sectionName: string, idx: number, dir: number) => {
    const sf = fields.filter(f => (f.section || 'General') === sectionName)
    const target = idx + dir
    if (target < 0 || target >= sf.length) return
    ;[sf[idx], sf[target]] = [sf[target], sf[idx]]
    const result: FormField[] = []
    sectionOrder.forEach(s => result.push(...(s === sectionName ? sf : fields.filter(f => (f.section || 'General') === s))))
    setFields(result)
  }

  const renameSection = (oldName: string, newName: string) => {
    if (!newName || newName === oldName) return
    if (sectionOrder.includes(newName)) { setToast({ type: 'error', message: `Section "${newName}" already exists.` }); return }
    setFields(fs => fs.map(f => (f.section || 'General') === oldName ? { ...f, section: newName } : f))
    setSectionOrder(o => o.map(s => s === oldName ? newName : s))
  }

  const moveSection = (idx: number, dir: number) => {
    const target = idx + dir
    if (target < 0 || target >= sectionOrder.length) return
    const next = [...sectionOrder]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setSectionOrder(next)
  }

  const deleteSection = (name: string) => {
    if (fields.some(f => (f.section || 'General') === name)) { setToast({ type: 'error', message: 'Move or delete all fields in this section first.' }); return }
    setSectionOrder(o => o.filter(s => s !== name))
  }

  const addSection = () => {
    const n = newSectionName.trim()
    if (!n) return
    if (sectionOrder.includes(n)) { setToast({ type: 'error', message: `Section "${n}" already exists.` }); return }
    setSectionOrder(o => [...o, n])
    setNewSectionName('')
    setShowAddSection(false)
  }

  const handleAddField = async (data: Record<string, unknown>) => {
    try {
      const created = await apiPost<FormField>('/crm/form-fields', { ...data, formType })
      setFields(fs => [...fs, created])
      if (created.section && !sectionOrder.includes(created.section)) setSectionOrder(o => [...o, created.section!])
      setAddFieldModal(null)
      setToast({ type: 'success', message: `Field "${created.label}" added.` })
    } catch (err) {
      setToast({ type: 'error', message: errFields(err).fieldKey?.[0] ?? errMsg(err, 'Failed to add field.') })
      throw err
    }
  }

  const handleEditField = async (f: FormField) => {
    try {
      await apiPut('/crm/form-fields', { formType, fields: [toUpdate(f, f.sortOrder ?? 0)] })
      setFields(fs => fs.map(x => x.fieldKey === f.fieldKey ? f : x))
      if (f.section && !sectionOrder.includes(f.section)) setSectionOrder(o => [...o, f.section!])
      setEditFieldModal(null)
      setToast({ type: 'success', message: `Field "${f.label}" updated.` })
    } catch (err) {
      setToast({ type: 'error', message: errMsg(err, 'Failed to update field.') })
      throw err
    }
  }

  const handleDeleteField = async (fieldKey: string) => {
    if (!window.confirm('Delete this field? This cannot be undone.')) return
    try {
      await apiDelete(`/crm/form-fields/${formType}/${fieldKey}`)
      setFields(fs => fs.filter(f => f.fieldKey !== fieldKey))
      setToast({ type: 'success', message: 'Field deleted.' })
    } catch (err) {
      setToast({ type: 'error', message: errMsg(err, 'Failed to delete field.') })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const ordered: FormField[] = []
      sectionOrder.forEach(s => { if (grouped[s]) ordered.push(...grouped[s]) })
      await apiPut('/crm/form-fields', { formType, fields: ordered.map((f, i) => toUpdate(f, i + 1)) })
      setToast({ type: 'success', message: 'Form configuration saved!' })
    } catch (err) {
      setToast({ type: 'error', message: errMsg(err, 'Failed to save changes.') })
    } finally { setSaving(false) }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs" style={{ color: '#64748B' }}>
        <span>Use ↑↓ arrows to reorder fields within a section, or to reorder sections.</span>
        <span>Width buttons set how much horizontal space the field takes on the {formLabel}.</span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 880 }}>
          {sectionOrder.map((sectionName, si) => {
            const sf = grouped[sectionName] || []
            return (
              <div key={sectionName} className="mb-4 overflow-hidden" style={{ background: WHITE, border: `1px solid ${P.border}`, borderRadius: 12 }}>
                <SectionHeader name={sectionName} hasFields={sf.length > 0} isFirst={si === 0} isLast={si === sectionOrder.length - 1}
                  onRename={n => renameSection(sectionName, n)} onDelete={() => deleteSection(sectionName)}
                  onMoveUp={() => moveSection(si, -1)} onMoveDown={() => moveSection(si, 1)} />
                {sf.length > 0 && (
                  <div className="flex items-center px-4" style={{ gap: 8, padding: '7px 16px', ...TH_ROW }}>
                    <div style={{ width: W.arrows }} />
                    <div style={{ width: W.num }} />
                    <div style={{ width: W.label }}>Label / Placeholder</div>
                    <div style={{ width: W.width }}>Width</div>
                    <div style={{ width: W.type }}>Type</div>
                    <div style={{ width: W.options }}>Options</div>
                    <div style={{ width: W.visible }}>Visible</div>
                    <div style={{ width: W.required }}>Required</div>
                    <div style={{ width: W.del }} />
                    <div style={{ width: W.edit }} />
                  </div>
                )}
                {sf.map((field, fi) => (
                  <FieldRow key={field.fieldKey} field={field} index={fi} count={sf.length}
                    onChange={c => updateField(field.fieldKey, c)}
                    onEditOptions={() => setEditOptionsModal({ ...field })}
                    onDelete={() => handleDeleteField(field.fieldKey)}
                    onEdit={() => setEditFieldModal({ ...field })}
                    onMoveUp={() => moveField(sectionName, fi, -1)}
                    onMoveDown={() => moveField(sectionName, fi, 1)} />
                ))}
                <div className="px-4 py-2.5 border-t border-dashed" style={{ borderColor: '#E2E8F0' }}>
                  <button onClick={() => setAddFieldModal({ section: sectionName })} className="flex items-center gap-1.5 text-sm font-semibold transition-colors" style={{ color: TEAL }}>
                    <PlusIcon /> Add Field to &quot;{sectionName}&quot;
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mb-6">
        {showAddSection ? (
          <div className="flex items-center gap-2 p-4 rounded-xl border-2 border-dashed" style={{ borderColor: TEAL, background: 'rgba(30,132,150,0.04)' }}>
            <input type="text" value={newSectionName} onChange={e => setNewSectionName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') setShowAddSection(false) }}
              placeholder="Section name, e.g. Insurance Details"
              className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ borderColor: TEAL, color: NAVY }} />
            <button onClick={addSection} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: GRAD }}>Create</button>
            <button onClick={() => setShowAddSection(false)} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1px solid #CBD5E1', color: '#64748B' }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowAddSection(true)} className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-dashed w-full text-sm font-semibold" style={{ borderColor: '#CBD5E1', color: '#64748B' }}>
            <PlusIcon /> Add New Section
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs" style={{ color: '#94A3B8' }}>
          Reordering, label edits, width and toggle changes are saved together via Save All. New fields and deletions apply immediately.
        </p>
        <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-white flex-shrink-0"
          style={{ background: GRAD, fontFamily: "'Aptos', sans-serif", fontSize: '1rem', letterSpacing: '0.05em', opacity: saving ? 0.65 : 1, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(30,132,150,0.25)' }}>
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      {addFieldModal && <AddFieldModal defaultSection={addFieldModal.section} sections={sectionOrder} onAdd={handleAddField} onClose={() => setAddFieldModal(null)} />}
      {editFieldModal && <EditFieldModal field={editFieldModal} sections={sectionOrder} onSave={handleEditField} onClose={() => setEditFieldModal(null)} />}
      {editOptionsModal && (
        <EditOptionsModal field={editOptionsModal}
          onSave={opts => { updateField(editOptionsModal.fieldKey, { options: opts }); setEditOptionsModal(null) }}
          onClose={() => setEditOptionsModal(null)} />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// User Access Level
// ════════════════════════════════════════════════════════════════════════════
const ROLE_OPTS = [
  { value: 'AGENT', label: 'Agent' }, { value: 'MANAGER', label: 'Manager' },
  { value: 'DIRECTOR', label: 'Director' }, { value: 'ADMIN', label: 'Admin' },
]
const STATUS_COLOR: Record<string, string> = { active: '#16a34a', inactive: '#dc2626', locked: '#d97706' }

function UserAccessTab({ setToast }: { setToast: SetToast }) {
  const [users, setUsers]     = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Record<string, string>>({})
  const [saving, setSaving]   = useState<Record<string, boolean>>({})

  useEffect(() => {
    apiGet<User[]>('/users', { perPage: 'all' })
      .then(r => setUsers(Array.isArray(r) ? r : []))
      .catch(() => setToast({ type: 'error', message: 'Failed to load users.' }))
      .finally(() => setLoading(false))
  }, [setToast])

  const save = async (user: User) => {
    const role = pending[user.id]
    if (!role) return
    setSaving(s => ({ ...s, [user.id]: true }))
    try {
      const res = await apiPut<{ user: User }>(`/crm/users/${user.id}/role`, { role })
      setToast({ type: 'success', message: `Role updated for ${user.displayName ?? user.userCode}.` })
      setPending(p => { const n = { ...p }; delete n[user.id]; return n })
      setUsers(us => us.map(u => u.id === user.id ? { ...u, ...res.user } : u))
    } catch (err) {
      setToast({ type: 'error', message: errMsg(err, 'Failed to update role.') })
    } finally {
      setSaving(s => { const n = { ...s }; delete n[user.id]; return n })
    }
  }

  const statusOf = (u: User) => (!u.isActive ? 'inactive' : u.profileLocked ? 'locked' : 'active')
  const isDirty = (u: User) => pending[u.id] !== undefined && pending[u.id] !== u.role

  return (
    <DataTable<User>
      id="crm-user-access"
      rows={users}
      loading={loading}
      rowKey={u => u.id}
      emptyText="No users found."
      // The role dropdown opens below its cell, so the table must not clip it
      containerStyle={{ overflowX: 'visible' }}
      columns={[
        { key: 'name', label: 'Name', width: 200, headerStyle: { borderTopLeftRadius: 11 }, render: u => <span style={{ fontWeight: 600, color: P.textHeading }}>{u.displayName || 'N/A'}</span> },
        { key: 'code', label: 'Username', width: 120, render: u => <span style={{ fontSize: 12, fontWeight: 700, color: P.teal, letterSpacing: '0.04em' }}>{u.userCode}</span> },
        { key: 'role', label: 'Role', width: 170, cellStyle: { overflow: 'visible' }, render: u => (
          <StyledSelect value={pending[u.id] ?? u.role} onChange={v => setPending(p => ({ ...p, [u.id]: v }))} options={ROLE_OPTS} borderColor={isDirty(u) ? TEAL : undefined} compact />
        ) },
        { key: 'dept', label: 'Department', width: 170, render: u => <span style={{ fontSize: 12, color: P.slate }}>{u.department ?? u.managerType ?? 'N/A'}</span> },
        { key: 'status', label: 'Status', width: 110, render: u => {
          const s = statusOf(u)
          return <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: `${STATUS_COLOR[s]}18`, color: STATUS_COLOR[s] }}>{s}</span>
        } },
        { key: 'action', label: 'Action', width: 100, resizable: false, headerStyle: { borderTopRightRadius: 11 }, render: u => isDirty(u) && (
          <button onClick={() => save(u)} disabled={saving[u.id]}
            style={{ padding: '4px 12px', borderRadius: 8, border: 0, background: GRAD, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving[u.id] ? 0.6 : 1, fontFamily: "'Aptos', sans-serif" }}>
            {saving[u.id] ? 'Saving...' : 'Save'}
          </button>
        ) },
      ]}
    />
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE: second vertical menu on the left, the same pattern as argroup's Settings page
// ════════════════════════════════════════════════════════════════════════════
const NAV_SLATE  = '#64748B'
const NAV_ACTIVE = '#E8EEF7'
const NAV_HOVER  = 'rgba(30,132,150,0.12)'
const NAV_BORDER = '#E2E8F0'

const icon = (d: string) => <path strokeLinecap="round" strokeLinejoin="round" d={d} />
const NAV = [
  { key: 'access',  label: 'User Access Level', icon: icon('M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z') },
  { key: 'sale',    label: 'Sale Form',         icon: icon('M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25M8.25 8.25H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z') },
  { key: 'client',  label: 'Client Form',       icon: icon('M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z') },
  { key: 'profile', label: 'Profile Form',      icon: icon('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
] as const
const ATT_SUB = [
  { key: 'att-time',  label: 'Attendance Time', color: TEAL },
  { key: 'att-apply', label: 'Applicability',   color: P.purple },
] as const

type NavKey = typeof NAV[number]['key'] | typeof ATT_SUB[number]['key']

const navBtnStyle = (active: boolean, sub = false, color = TEAL): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: sub ? 8 : 10,
  padding: sub ? '0.3rem 0.75rem 0.3rem 40px' : '0.3rem 0.75rem', borderRadius: 8, border: 'none',
  borderLeft: `3px solid ${active ? color : 'transparent'}`,
  cursor: 'pointer', textAlign: 'left', width: '100%', whiteSpace: 'nowrap',
  fontFamily: "'Rajdhani', sans-serif", fontSize: sub ? 14 : 16, fontWeight: 600, letterSpacing: '0.03em',
  transition: 'background .15s, color .15s',
  background: active ? NAV_ACTIVE : 'transparent',
  color: active ? (sub ? color : NAVY) : NAV_SLATE,
})
const hoverOn  = (active: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => { if (!active) { e.currentTarget.style.background = NAV_HOVER; e.currentTarget.style.color = NAVY } }
const hoverOff = (active: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = NAV_SLATE } }

export default function CrmManagementPage() {
  const { sidebarCollapsed } = useLayout()
  const [active, setActive]       = useState<NavKey>('access')
  const [attOpen, setAttOpen]     = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [toast, setToastState]    = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const setToast = useCallback<SetToast>(t => setToastState(t), [])

  const isAtt  = active.startsWith('att-')
  const attSub = ATT_SUB.find(s => s.key === active)
  const title  = isAtt ? 'Attendance Settings' : NAV.find(n => n.key === active)?.label ?? ''

  const pick = (key: NavKey) => { setActive(key); if (!key.startsWith('att-')) setAttOpen(false) }
  const toggleAtt = () => { setAttOpen(o => !o); if (!attOpen && !isAtt) setActive('att-time') }

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToastState(null)} />}
      <div style={{ display: 'flex', minHeight: '100vh', background: BG, position: 'relative' }}>

        {/* Second sidebar */}
        <div style={{ width: collapsed ? 0 : 260, flexShrink: 0, overflow: 'hidden', background: P.sidebarBg, borderRight: `1px solid ${NAV_BORDER}`, transition: 'width .25s' }}>
          <div style={{ minWidth: 260, position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: sidebarCollapsed ? '0 16px 0 54px' : '0 16px', height: 52, borderBottom: `1px solid ${NAV_BORDER}` }}>
              <PageTitle size={18}>CRM Management</PageTitle>
              <button onClick={() => setCollapsed(true)} title="Hide menu"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.iconMuted, padding: 4, borderRadius: 6, display: 'flex' }}
                onMouseEnter={e => { e.currentTarget.style.color = NAVY; e.currentTarget.style.background = NAV_HOVER }}
                onMouseLeave={e => { e.currentTarget.style.color = P.iconMuted; e.currentTarget.style.background = 'transparent' }}>
                <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>

            <nav style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column' }}>
              {NAV.map(n => {
                const on = active === n.key
                return (
                  <button key={n.key} onClick={() => pick(n.key)} style={navBtnStyle(on)} onMouseEnter={hoverOn(on)} onMouseLeave={hoverOff(on)}>
                    <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={on ? TEAL : P.iconMuted} style={{ flexShrink: 0 }}>{n.icon}</svg>
                    {n.label}
                  </button>
                )
              })}

              <button onClick={toggleAtt} style={navBtnStyle(isAtt)} onMouseEnter={hoverOn(isAtt)} onMouseLeave={hoverOff(isAtt)}>
                <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={isAtt ? TEAL : P.iconMuted} style={{ flexShrink: 0 }}>
                  {icon('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z')}
                </svg>
                <span style={{ flex: 1 }}>Attendance Settings</span>
                <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ transition: 'transform .2s', transform: attOpen ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {attOpen && ATT_SUB.map(s => {
                const on = active === s.key
                return (
                  <button key={s.key} onClick={() => pick(s.key)} style={navBtnStyle(on, true, s.color)} onMouseEnter={hoverOn(on)} onMouseLeave={hoverOff(on)}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    {s.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {collapsed && (
          <button onClick={() => setCollapsed(false)} title="Show menu"
            style={{ position: 'absolute', left: 0, top: 64, zIndex: 20, width: 22, height: 44, background: P.sidebarBg, border: `1px solid ${NAV_BORDER}`, borderLeft: 'none', borderRadius: '0 8px 8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.iconMuted, boxShadow: '2px 0 8px rgba(0,0,0,0.06)' }}
            onMouseEnter={e => { e.currentTarget.style.color = NAVY }} onMouseLeave={e => { e.currentTarget.style.color = P.iconMuted }}>
            <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, padding: collapsed ? '0 20px 20px 36px' : '0 20px 20px' }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <PageTitle>{title}</PageTitle>
            {attSub && (
              <span style={{ fontSize: 12, fontWeight: 600, color: attSub.color, background: '#F3F4F6', padding: '3px 12px', borderRadius: 20, fontFamily: "'Aptos', sans-serif" }}>{attSub.label}</span>
            )}
          </div>

          {active === 'access'    && <UserAccessTab setToast={setToast} />}
          {active === 'sale'      && <FormManagementTab key="sale" formType="sale" formLabel="Sale Form" setToast={setToast} />}
          {active === 'client'    && <FormManagementTab key="client" formType="client" formLabel="Client Form" setToast={setToast} />}
          {active === 'profile'   && <FormManagementTab key="user" formType="user" formLabel="Profile Form" setToast={setToast} />}
          {active === 'att-time'  && <AttendanceSettings />}
          {active === 'att-apply' && <AttendanceApplicabilitySettings />}
        </div>
      </div>
    </>
  )
}
