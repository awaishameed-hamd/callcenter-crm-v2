'use client'

// HR's interview forms: one per role (Medicare, Final Expense, Auto, Manager...) and walk-in
// versions. HR adds, removes, reorders and edits questions; a form already used on interviews is
// turned off rather than deleted, and the interviews keep the questions they were asked.

import { useEffect, useState } from 'react'
import { P } from '@/lib/palette'
import { apiDelete, apiPost, apiPut, errMsg } from '@/lib/api'
import StyledSelect from '@/components/ui/StyledSelect'
import { Field, Svg, withAlpha, RAJDHANI } from '@/components/sales/saleUi'
import { OUTFIT, FONT, IC, QTYPE_LABEL, Btn, Segmented, ErrorBox, Pill, type FormFull, type Kind, type QType, type Question } from './shared'

const cls = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'

type Draft = { id: string | null; name: string; kind: Kind; description: string; isActive: boolean; questions: (Question & { optionsText?: string })[] }
const blank = (): Draft => ({ id: null, name: '', kind: 'SCHEDULED', description: '', isActive: true, questions: [{ id: '', label: '', type: 'text' }] })
const toDraft = (f: FormFull): Draft => ({ id: f.id, name: f.name, kind: f.kind, description: f.description ?? '', isActive: f.isActive, questions: f.questions.map(q => ({ ...q, optionsText: (q.options ?? []).join(', ') })) })

export default function FormsManager({ forms, reload, notify }: { forms: FormFull[]; reload: () => Promise<unknown>; notify: (m: string, t?: 'success' | 'error') => void }) {
  // The list shows scheduled forms first, so open the top one
  const first = forms.find(f => f.kind === 'SCHEDULED') ?? forms[0]
  const [selId, setSelId] = useState<string | null>(first?.id ?? null)
  const [draft, setDraft] = useState<Draft | null>(first ? toDraft(first) : null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!draft && first) { setSelId(first.id); setDraft(toDraft(first)) }
  }, [forms]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (f: FormFull | null, discard = false) => {
    if (dirty && !discard && !confirm('Discard the changes to this form?')) return
    setSelId(f?.id ?? null); setDraft(f ? toDraft(f) : blank()); setDirty(false); setError('')
  }
  const edit = (patch: Partial<Draft>) => { setDraft(d => d && { ...d, ...patch }); setDirty(true) }
  const editQ = (i: number, patch: Partial<Draft['questions'][number]>) => edit({ questions: draft!.questions.map((q, j) => j === i ? { ...q, ...patch } : q) })
  const moveQ = (i: number, by: number) => { const qs = [...draft!.questions]; const [q] = qs.splice(i, 1); qs.splice(i + by, 0, q); edit({ questions: qs }) }

  async function save() {
    if (!draft) return
    setBusy(true); setError('')
    try {
      const body = { name: draft.name, kind: draft.kind, description: draft.description, isActive: draft.isActive,
        questions: draft.questions.map(({ optionsText, ...q }) => ({ ...q, id: q.id || undefined, options: q.type === 'choice' ? (optionsText ?? '').split(',').map(s => s.trim()).filter(Boolean) : undefined })) }
      const saved = draft.id ? await apiPut<FormFull>(`/interview-forms/${draft.id}`, body) : await apiPost<FormFull>('/interview-forms', body)
      await reload()
      setSelId(saved.id); setDraft(toDraft({ ...saved, used: forms.find(f => f.id === saved.id)?.used ?? 0 })); setDirty(false)
      notify('Form saved')
    } catch (e) { setError(errMsg(e, 'Could not save the form.')) }
    finally { setBusy(false) }
  }

  async function duplicate() {
    if (!draft?.id) return
    setBusy(true)
    try { const f = await apiPost<FormFull>(`/interview-forms/${draft.id}/duplicate`); await reload(); setSelId(f.id); setDraft(toDraft({ ...f, used: 0 })); setDirty(false); notify('Copy created') }
    catch (e) { notify(errMsg(e, 'Could not copy the form.'), 'error') }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!draft?.id) return
    const used = forms.find(f => f.id === draft.id)?.used ?? 0
    if (!confirm(used ? `This form is on ${used} interview${used > 1 ? 's' : ''}, so it will be turned off (kept for the record). Continue?` : `Delete "${draft.name}"?`)) return
    setBusy(true)
    try {
      const r = await apiDelete<{ message: string }>(`/interview-forms/${draft.id}`)
      await reload(); notify(r.message)
      if (!used) { setSelId(null); setDraft(null) } else { setDraft(d => d && { ...d, isActive: false }) }
      setDirty(false)
    } catch (e) { notify(errMsg(e, 'Could not remove the form.'), 'error') }
    finally { setBusy(false) }
  }

  const groups: [Kind, string][] = [['SCHEDULED', 'Scheduled interviews'], ['WALK_IN', 'Walk-in interviews']]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14, height: 'calc(100vh - 128px)', minHeight: 460 }}>
      {/* List */}
      <aside style={{ background: '#fff', borderRadius: 16, border: `1px solid ${withAlpha(P.navy, 0.07)}`, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${withAlpha(P.navy, 0.07)}` }}>
          <Btn tone="primary" icon={IC.plus} onClick={() => open(null)}>New Form</Btn>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '6px 8px 10px' }}>
          {groups.map(([kind, label]) => (
            <div key={kind}>
              <div style={{ padding: '10px 8px 4px', fontFamily: RAJDHANI, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A97AB' }}>{label}</div>
              {forms.filter(f => f.kind === kind).map(f => {
                const on = f.id === selId
                return (
                  <button key={f.id} type="button" onClick={() => open(f)}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 2, borderRadius: 10, border: 0, cursor: 'pointer', fontFamily: FONT,
                      background: on ? withAlpha(P.teal, 0.1) : 'transparent', opacity: f.isActive ? 1 : 0.55 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? '#fff' : '#F1F4F7', color: on ? P.teal : '#8A97AB' }}>
                      <Svg d={kind === 'WALK_IN' ? IC.walk : IC.form} size={14} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: P.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                      <span style={{ fontSize: 11.5, color: '#8A97AB' }}>{f.questions.length} questions{f.used ? `, used ${f.used}x` : ''}{f.isActive ? '' : ', off'}</span>
                    </span>
                  </button>
                )
              })}
              {!forms.some(f => f.kind === kind) && <div style={{ padding: '4px 10px 8px', fontSize: 12, color: '#A3ADBB' }}>No forms yet</div>}
            </div>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <section style={{ background: '#fff', borderRadius: 16, border: `1px solid ${withAlpha(P.navy, 0.07)}`, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {!draft ? (
          <div style={{ margin: 'auto', color: '#8A97AB', fontSize: 13 }}>Choose a form on the left, or create a new one.</div>
        ) : <>
          <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${withAlpha(P.navy, 0.07)}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: OUTFIT, fontSize: 17, fontWeight: 600, color: P.navy }}>{draft.id ? 'Edit Form' : 'New Form'}</span>
              {draft.id && !draft.isActive && <Pill color="#6B7280">Turned off</Pill>}
              <span style={{ flex: 1 }} />
              {draft.id && <Btn small icon={IC.copy} onClick={duplicate} disabled={busy}>Duplicate</Btn>}
              {draft.id && <Btn small tone="danger" icon={IC.trash} onClick={remove} disabled={busy}>{(forms.find(f => f.id === draft.id)?.used ?? 0) ? 'Turn Off' : 'Delete'}</Btn>}
            </div>
            <ErrorBox text={error} />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) auto minmax(0, 1.6fr) auto', gap: 14, alignItems: 'end' }}>
              <Field label="Form name" required><input className={cls} value={draft.name} onChange={e => edit({ name: e.target.value })} placeholder="e.g. Medicare Agent" /></Field>
              <Field label="Type"><Segmented value={draft.kind} onChange={v => edit({ kind: v })} options={[['SCHEDULED', 'Scheduled'], ['WALK_IN', 'Walk-in']]} /></Field>
              <Field label="Description"><input className={cls} value={draft.description} onChange={e => edit({ description: e.target.value })} placeholder="Who this form is for" /></Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: P.navy, cursor: 'pointer', paddingBottom: 7, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={draft.isActive} onChange={e => edit({ isActive: e.target.checked })} style={{ accentColor: P.teal, width: 15, height: 15 }} /> In use
              </label>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 170px 86px 88px', gap: 10, padding: '0 10px 6px', fontFamily: RAJDHANI, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A97AB' }}>
              <span>#</span><span>Question</span><span>Answer type</span><span>Required</span><span />
            </div>
            {draft.questions.map((q, i) => (
              <div key={i} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 12, border: '1px solid #EEF1F5', background: '#FBFCFD' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 170px 86px 88px', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: RAJDHANI, fontSize: 14, fontWeight: 700, color: P.teal }}>{i + 1}</span>
                  <input className={cls} value={q.label} onChange={e => editQ(i, { label: e.target.value })} placeholder="Type the question" />
                  <StyledSelect value={q.type} onChange={v => editQ(i, { type: v as QType })} options={(Object.keys(QTYPE_LABEL) as QType[]).map(t => ({ value: t, label: QTYPE_LABEL[t] }))} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: P.navy, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!q.required} onChange={e => editQ(i, { required: e.target.checked })} style={{ accentColor: P.teal, width: 15, height: 15 }} /> Yes
                  </label>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {[[IC.up, -1, i === 0], [IC.down, 1, i === draft.questions.length - 1]].map(([icon, by, off], k) => (
                      <button key={k} type="button" disabled={off as boolean} onClick={() => moveQ(i, by as number)} title={by === -1 ? 'Move up' : 'Move down'}
                        style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${P.border}`, background: '#fff', color: P.navy, cursor: off ? 'default' : 'pointer', opacity: off ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Svg d={icon as string} size={12} />
                      </button>
                    ))}
                    <button type="button" title="Remove question" disabled={draft.questions.length === 1} onClick={() => edit({ questions: draft.questions.filter((_, j) => j !== i) })}
                      style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #F5C2C2', background: '#fff', color: '#B91C1C', cursor: draft.questions.length === 1 ? 'default' : 'pointer', opacity: draft.questions.length === 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Svg d={IC.trash} size={12} />
                    </button>
                  </div>
                </div>
                {q.type === 'choice' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10, marginTop: 6 }}>
                    <span />
                    <input className={cls} value={q.optionsText ?? ''} onChange={e => editQ(i, { optionsText: e.target.value })} placeholder="Options, separated by commas: e.g. Excellent, Good, Average, Weak" />
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={() => edit({ questions: [...draft.questions, { id: '', label: '', type: 'text' }] })}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 12, border: `1.5px dashed ${withAlpha(P.teal, 0.45)}`, background: '#F8FBFC', color: P.teal, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              <Svg d={IC.plus} size={14} /> Add Question
            </button>
          </div>

          <footer style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderTop: `1px solid ${withAlpha(P.navy, 0.07)}`, background: '#FAFBFC', flexShrink: 0 }}>
            <span style={{ flex: 1, fontSize: 12.5, color: '#8A97AB' }}>
              {dirty ? 'Unsaved changes' : (forms.find(f => f.id === draft.id)?.used ?? 0) ? 'Interviews already done keep the questions they were asked.' : `${draft.questions.length} question${draft.questions.length === 1 ? '' : 's'}`}
            </span>
            {dirty && <Btn onClick={() => open(forms.find(f => f.id === draft.id) ?? null, true)}>Discard</Btn>}
            <Btn tone="primary" icon={IC.check} onClick={save} disabled={busy || !dirty}>{busy ? 'Saving...' : 'Save Form'}</Btn>
          </footer>
        </>}
      </section>
    </div>
  )
}
