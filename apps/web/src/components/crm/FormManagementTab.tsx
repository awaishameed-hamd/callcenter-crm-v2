'use client'

// Sale / Client / Profile form builder: sections, field order, widths, visibility and required flags.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiGet, apiPost, apiPut, apiDelete, errMsg, errFields } from '@/lib/api'
import type { FormField } from '@/types'
import { P } from '@/lib/palette'
import { NAVY, TEAL, WHITE, GRAD, TH_ROW, WIDTH_OPTS, NO_PLACEHOLDER, SetToast, TypeBadge, CoreBadge, Toggle, ArrowBtn, EditIcon, PlusIcon, Spinner } from './shared'
import { AddFieldModal, EditFieldModal, EditOptionsModal } from './FieldEditors'
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
          {field.optionsFromVerticals ? (
            <span title='Options are the vertical list. Change them under Verticals.' className='inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold' style={{ color: TEAL, background: 'rgba(30,132,150,0.06)', border: '1px dashed rgba(30,132,150,0.35)' }}>Verticals</span>
          ) : field.fieldType === 'select' ? (
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

export function FormManagementTab({ formType, formLabel, setToast }: { formType: string; formLabel: string; setToast: SetToast }) {
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

      {/* How these settings appear on the agent's New Sale page */}
      {formType === 'sale' && (
        <div className="mb-4 rounded-xl px-4 py-3 text-xs" style={{ background: P.fillTeal, border: `1px solid ${P.teal}33`, color: P.navy, lineHeight: 1.6 }}>
          <p className="font-bold mb-1" style={{ color: P.teal }}>How the New Sale page uses this form</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Vertical Type options become the coloured pills at the top; Select DID shows that vertical&apos;s DIDs as tiles.</li>
            <li>Each section is a card, in this order. The first section sits beside the DID card, the rest go two per row.</li>
            <li>Textarea fields are drawn as large boxes at the bottom of their card (Rows sets the minimum height). Every other field sits above them, sized by its Width.</li>
            <li>Hidden fields are left out, and Required fields are counted in the summary bar.</li>
          </ul>
        </div>
      )}

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
