'use client'

// Modals for adding a form field, editing it, and editing a dropdown field's options.

import { useState, useCallback } from 'react'
import StyledSelect from '@/components/ui/StyledSelect'
import type { FormField } from '@/types'
import { NAVY, TEAL, WHITE, GRAD, FIELD_TYPES, WIDTH_OPTS, NO_PLACEHOLDER, FieldDraft, Toggle, Label } from './shared'
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
export function AddFieldModal({ defaultSection, sections, onAdd, onClose }: {
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
export function EditFieldModal({ field, sections, onSave, onClose }: {
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
export function EditOptionsModal({ field, onSave, onClose }: { field: FormField; onSave: (o: string[]) => void; onClose: () => void }) {
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
