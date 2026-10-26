'use client'

// One interview from end to end: the candidate, the actions for where it stands, the interview
// form HR fills while talking to them, and the full trail of what happened when.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { P } from '@/lib/palette'
import { apiGet, apiPost, apiPut, errMsg } from '@/lib/api'
import { fileHref } from '@/lib/storage'
import StyledSelect from '@/components/ui/StyledSelect'
import { Svg, withAlpha, RAJDHANI } from '@/components/sales/saleUi'
import CandidateModal from './CandidateModal'
import ActionModal, { type Action } from './ActionModal'
import {
  OUTFIT, FONT, IC, STATUS, RESULT, Btn, Panel, Detail, Segmented, StatusPill, ResultPill, CopyBtn, WhatsAppIcon, ErrorBox,
  fmtStamp, fmtDay, fmtTime, fmtDob, relTime, money, years, waNumber, useNow,
  type InterviewFull, type Meta, type FormFull, type Question, type Result, type InterviewEvent,
} from './shared'

const cls = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'

const EVENT: Record<string, { label: string; icon: string; color: string }> = {
  SCHEDULED:         { label: 'Interview scheduled', icon: IC.calendar, color: '#2563EB' },
  WALK_IN:           { label: 'Walked in',           icon: IC.walk,     color: '#D97706' },
  EMAIL_SENT:        { label: 'Email sent',          icon: IC.mail,     color: P.teal },
  EMAIL_FAILED:      { label: 'Email not sent',      icon: IC.mail,     color: '#B91C1C' },
  REMINDER:          { label: '30 minute reminder sent to HR', icon: IC.bell, color: '#7C3AED' },
  REMINDER_SEEN:     { label: 'Reminder seen',       icon: IC.bell,     color: '#6B7280' },
  CALLED:            { label: 'Called the candidate', icon: IC.phone,   color: P.teal },
  RESCHEDULED:       { label: 'Rescheduled',         icon: IC.refresh,  color: '#B45309' },
  ARRIVED:           { label: 'Arrived',             icon: IC.check,    color: '#D97706' },
  NO_SHOW:           { label: 'Did not come',        icon: IC.x,        color: '#B91C1C' },
  CANCELLED:         { label: 'Cancelled',           icon: IC.x,        color: '#6B7280' },
  EVALUATION_SAVED:  { label: 'Answers saved',       icon: IC.form,     color: P.navy },
  COMPLETED:         { label: 'Interview completed', icon: IC.star,     color: '#15803D' },
  CANDIDATE_UPDATED: { label: 'Candidate details updated', icon: IC.user, color: '#6B7280' },
  NOTE:              { label: 'Note',                icon: IC.note,     color: P.navy },
}

function eventText(e: InterviewEvent) {
  if (e.type === 'RESCHEDULED' && e.data?.to) {
    const moved = `${e.data.from ? `From ${fmtStamp(e.data.from)} to` : 'To'} ${fmtStamp(e.data.to)}`
    return e.note ? `${moved}. ${e.note}` : moved
  }
  return e.note ?? ''
}

// ── One question ────────────────────────────────────────────────────────────

function Chip({ on, onClick, children, color = P.teal, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ minWidth: 38, padding: '5px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: disabled ? 'default' : 'pointer',
        border: `1.5px solid ${on ? color : '#E2E8F0'}`, background: on ? withAlpha(color, 0.1) : '#fff', color: on ? color : '#5C6D82' }}>
      {children}
    </button>
  )
}

function Answer({ q, value, onChange, readOnly }: { q: Question; value: any; onChange: (v: any) => void; readOnly: boolean }) {
  switch (q.type) {
    case 'rating': return (
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => <Chip key={n} on={Number(value) === n} disabled={readOnly} onClick={() => onChange(Number(value) === n ? '' : n)} color={n <= 2 ? '#B91C1C' : n === 3 ? '#B45309' : '#15803D'}>{n}</Chip>)}
        <span style={{ alignSelf: 'center', fontSize: 11.5, color: '#8A97AB', marginLeft: 4 }}>1 poor, 5 excellent</span>
      </div>
    )
    case 'yesno': return (
      <div style={{ display: 'flex', gap: 6 }}>
        <Chip on={value === 'yes'} disabled={readOnly} onClick={() => onChange(value === 'yes' ? '' : 'yes')} color="#15803D">Yes</Chip>
        <Chip on={value === 'no'} disabled={readOnly} onClick={() => onChange(value === 'no' ? '' : 'no')} color="#B91C1C">No</Chip>
      </div>
    )
    case 'choice': return (q.options ?? []).length <= 5
      ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(q.options ?? []).map(o => <Chip key={o} on={value === o} disabled={readOnly} onClick={() => onChange(value === o ? '' : o)}>{o}</Chip>)}</div>
      : <StyledSelect value={value ?? ''} onChange={onChange} disabled={readOnly} placeholder="Choose" options={(q.options ?? []).map(o => ({ value: o, label: o }))} />
    case 'number': return <input type="number" className={cls} style={{ maxWidth: 200 }} value={value ?? ''} readOnly={readOnly} onChange={e => onChange(e.target.value)} />
    case 'textarea': return <textarea className={`${cls} resize-none`} rows={2} value={value ?? ''} readOnly={readOnly} onChange={e => onChange(e.target.value)} />
    default: return <input className={cls} value={value ?? ''} readOnly={readOnly} onChange={e => onChange(e.target.value)} />
  }
}

const answered = (v: any) => v !== undefined && v !== null && v !== ''

// ── Drawer ──────────────────────────────────────────────────────────────────

export default function InterviewDrawer({ id, meta, forms, onClose, onChanged, onOpen, notify }: {
  id: string; meta: Meta | null; forms: FormFull[]
  onClose: () => void; onChanged: () => void; onOpen: (id: string) => void
  notify: (msg: string, type?: 'success' | 'error') => void
}) {
  const now = useNow()
  const [iv, setIv] = useState<InterviewFull | null>(null)
  const [loadError, setLoadError] = useState('')
  const [modal, setModal] = useState<Action | 'candidate' | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  // Evaluation being filled
  const [formId, setFormId] = useState('')
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [rating, setRating] = useState<number | ''>('')
  const [result, setResult] = useState<Result>('PENDING')
  const [remarks, setRemarks] = useState('')
  const [interviewerId, setInterviewerId] = useState('')
  const [dirty, setDirty] = useState(false)
  const [evalError, setEvalError] = useState('')
  const [editingDone, setEditingDone] = useState(false)

  const take = useCallback((x: InterviewFull, resetForm = true) => {
    setIv(x)
    if (resetForm) {
      setFormId(x.formId ?? '')
      setAnswers(x.answers ?? {})
      setRating(x.rating ?? '')
      setResult(x.result)
      setRemarks(x.remarks ?? '')
      setInterviewerId(x.interviewerId ?? '')
      setDirty(false)
      setEvalError('')
      setEditingDone(false)
    }
  }, [])

  useEffect(() => {
    setIv(null); setLoadError('')
    apiGet<InterviewFull>(`/interviews/${id}`).then(x => take(x)).catch(e => setLoadError(errMsg(e, 'Could not open this interview.')))
  }, [id, take])

  const close = () => { if (dirty && !confirm('You have answers that are not saved. Close anyway?')) return; onClose() }
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !modal) close() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  // Answered questions are kept with the interview, so later edits to the form do not change them
  const questions: Question[] = useMemo(() => {
    if (!iv || !formId) return []
    if (formId === iv.formId && iv.formSnapshot?.length) return iv.formSnapshot
    if (formId === iv.form?.id && iv.form.questions) return iv.form.questions
    return forms.find(f => f.id === formId)?.questions ?? []
  }, [iv, formId, forms])

  const after = (x: InterviewFull, msg?: string) => { take(x, !dirty); setModal(null); onChanged(); if (msg) notify(msg) }

  async function quick(path: string, body: unknown, msg: string) {
    if (!iv) return
    setBusy(path)
    try { after(await apiPost<InterviewFull>(`/interviews/${iv.id}/${path}`, body), msg) }
    catch (e) { notify(errMsg(e, 'Could not save.'), 'error') }
    finally { setBusy('') }
  }

  async function saveEval(complete: boolean) {
    if (!iv) return
    setEvalError(''); setBusy(complete ? 'complete' : 'save')
    try {
      const x = await apiPut<InterviewFull>(`/interviews/${iv.id}/evaluation`, { formId, answers, rating: rating === '' ? null : rating, remarks, result, interviewerId: interviewerId || null, complete })
      take(x); onChanged()
      notify(complete ? `Interview completed: ${RESULT[x.result].label}` : 'Answers saved')
    } catch (e) { setEvalError(errMsg(e, 'Could not save the answers.')) }
    finally { setBusy('') }
  }

  async function addNote() {
    if (!iv || !note.trim()) return
    setBusy('note')
    try { take(await apiPost<InterviewFull>(`/interviews/${iv.id}/notes`, { note }), !dirty); setNote('') }
    catch (e) { notify(errMsg(e, 'Could not add the note.'), 'error') }
    finally { setBusy('') }
  }

  const st = iv?.status
  const done = st === 'COMPLETED'
  const readOnly = st === 'CANCELLED' || (done && !editingDone)
  const answeredCount = questions.filter(q => answered(answers[q.id])).length
  const requiredLeft = questions.filter(q => q.required && !answered(answers[q.id])).length
  const c = iv?.candidate
  const upcoming = st === 'SCHEDULED' && iv?.scheduledAt

  return (
    <>
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(19,46,87,0.35)' }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1001, width: 'min(1240px, calc(100vw - 24px))', background: '#F2F4F7', display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px -20px rgba(19,46,87,0.45)', fontFamily: FONT }}>
        {/* Head */}
        <div style={{ background: `linear-gradient(120deg, ${P.navy} 0%, #1A4A73 55%, ${P.teal} 100%)`, color: '#fff', padding: '14px 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: OUTFIT, fontSize: 19, fontWeight: 600, flexShrink: 0 }}>
              {(c?.fullName ?? '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: OUTFIT, fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.fullName ?? (loadError ? 'Interview' : 'Loading...')}</div>
              {iv && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>{iv.position}</span>
                  {iv.kind === 'WALK_IN' && <><span>·</span><span>Walk-in</span></>}
                  {iv.scheduledAt && <><span>·</span><span>{fmtDay(iv.scheduledAt)}, {fmtTime(iv.scheduledAt)}{upcoming ? ` (${relTime(iv.scheduledAt, now)})` : ''}</span></>}
                  <span style={{ padding: '2px 9px', borderRadius: 99, background: '#fff', color: STATUS[iv.status].color, fontWeight: 800, fontSize: 11 }}>{STATUS[iv.status].label}</span>
                  {iv.result !== 'PENDING' && <span style={{ padding: '2px 9px', borderRadius: 99, background: RESULT[iv.result].color, color: '#fff', fontWeight: 800, fontSize: 11 }}>{RESULT[iv.result].label}</span>}
                  {iv.rescheduleCount > 0 && <span style={{ fontSize: 11.5, color: '#FDE68A', fontWeight: 700 }}>Rescheduled {iv.rescheduleCount}x</span>}
                </div>
              )}
            </div>
            <button type="button" onClick={close} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 10, border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
          {iv && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
              {(st === 'SCHEDULED' || st === 'NO_SHOW') && <Btn small tone="success" icon={IC.check} disabled={!!busy} onClick={() => quick('arrived', {}, 'Marked as arrived')}>Mark Arrived</Btn>}
              {st !== 'COMPLETED' && <Btn small tone="ghost" icon={IC.refresh} onClick={() => setModal('reschedule')}>{st === 'NO_SHOW' || st === 'CANCELLED' ? 'Book Again' : 'Reschedule'}</Btn>}
              {st === 'SCHEDULED' && <Btn small tone="ghost" icon={IC.phone} disabled={!!busy} onClick={() => quick('notes', { type: 'CALLED' }, 'Call recorded in the trail')}>Called</Btn>}
              {st === 'SCHEDULED' && c?.email && <Btn small tone="ghost" icon={IC.mail} disabled={!!busy} onClick={() => quick('email', {}, 'Invitation emailed again')}>Resend Email</Btn>}
              {st === 'SCHEDULED' && <Btn small tone="danger" icon={IC.x} onClick={() => setModal('noshow')}>No-show</Btn>}
              {st !== 'COMPLETED' && st !== 'CANCELLED' && <Btn small tone="danger" onClick={() => setModal('cancel')}>Cancel</Btn>}
              <span style={{ flex: 1 }} />
              <Btn small tone="ghost" icon={IC.form} onClick={() => setModal('details')}>Edit Details</Btn>
              <Btn small tone="ghost" icon={IC.user} onClick={() => setModal('candidate')}>Edit Candidate</Btn>
              <Btn small tone="danger" icon={IC.trash} title="Delete interview" onClick={() => setModal('delete')} />
            </div>
          )}
        </div>

        {loadError && <div style={{ padding: 20 }}><ErrorBox text={loadError} /></div>}
        {!iv && !loadError && <div style={{ padding: 40, textAlign: 'center', color: '#8A97AB', fontSize: 13 }}>Loading...</div>}

        {iv && c && (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '410px minmax(0, 1fr)', gap: 14, padding: 14 }}>
            {/* Left: candidate, interview, trail */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 2 }}>
              <Panel title="Candidate" icon={IC.user}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  <a href={`tel:${c.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: withAlpha(P.teal, 0.1), color: P.teal, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Svg d={IC.phone} size={13} />{c.phone}</a>
                  <CopyBtn text={c.phone} />
                  <a href={`https://wa.me/${waNumber(c.phone)}`} target="_blank" rel="noreferrer" title="WhatsApp" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: '#E7F8EE', color: '#16A34A' }}><WhatsAppIcon size={15} /></a>
                  {c.cvKey && <a href={fileHref(c.cvKey, { name: c.cvName ?? 'CV' })} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: P.navy, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}><Svg d={IC.doc} size={13} />Open CV</a>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 12px' }}>
                  <Detail label="Father name">{c.fatherName}</Detail>
                  <Detail label="CNIC">{c.cnic}</Detail>
                  <Detail label="Email" span={2}>{c.email}</Detail>
                  <Detail label="Alternate phone">{c.altPhone}</Detail>
                  <Detail label="Gender">{c.gender}</Detail>
                  <Detail label="Date of birth">{fmtDob(c.dateOfBirth)}</Detail>
                  <Detail label="City">{c.city}</Detail>
                  <Detail label="Address" span={2}>{c.address}</Detail>
                  <Detail label="Education">{c.education}</Detail>
                  <Detail label="Experience">{[years(c.experienceYears), c.callCenterYears !== null && c.callCenterYears !== undefined ? `${years(c.callCenterYears)} call center` : ''].filter(Boolean).join(', ')}</Detail>
                  <Detail label="Last company">{c.lastCompany}</Detail>
                  <Detail label="Last designation">{c.lastDesignation}</Detail>
                  <Detail label="Current salary">{money(c.currentSalary)}</Detail>
                  <Detail label="Expected salary">{money(c.expectedSalary)}</Detail>
                  <Detail label="Preferred shift">{c.preferredShift}</Detail>
                  <Detail label="Can join from">{fmtDob(c.availableFrom)}</Detail>
                  <Detail label="Found us through">{c.source}</Detail>
                  <Detail label="Referred by">{c.referredBy}</Detail>
                  {c.notes && <Detail label="Notes" span={2}><span style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{c.notes}</span></Detail>}
                </div>
              </Panel>

              <Panel title="Interview" icon={IC.calendar}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 12px' }}>
                  <Detail label={iv.kind === 'WALK_IN' ? 'Walked in' : 'Date and time'}>{iv.scheduledAt ? fmtStamp(iv.scheduledAt) : fmtStamp(iv.arrivedAt ?? iv.createdAt)}</Detail>
                  <Detail label="Duration">{`${iv.durationMin} minutes`}</Detail>
                  <Detail label="Mode">{iv.mode}</Detail>
                  <Detail label="Interviewer">{iv.interviewer?.displayName}</Detail>
                  {iv.location && <Detail label={iv.mode === 'Video' ? 'Meeting link' : iv.mode === 'Phone' ? 'Call note' : 'Location'} span={2}>{/^https?:\/\//.test(iv.location) ? <a href={iv.location} target="_blank" rel="noreferrer" style={{ color: P.teal }}>{iv.location}</a> : iv.location}</Detail>}
                  <Detail label="Arrived">{iv.arrivedAt ? fmtStamp(iv.arrivedAt) : ''}</Detail>
                  <Detail label="Completed">{iv.completedAt ? fmtStamp(iv.completedAt) : ''}</Detail>
                  <Detail label="Scheduled by">{iv.createdBy?.displayName}</Detail>
                  <Detail label="Form">{iv.form?.name}</Detail>
                </div>
              </Panel>

              {iv.history.length > 0 && (
                <Panel title="Earlier interviews" icon={IC.refresh}>
                  {iv.history.map(h => (
                    <button key={h.id} type="button" onClick={() => onOpen(h.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', border: 0, borderBottom: `1px dashed ${withAlpha(P.navy, 0.08)}`, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: P.navy }}>{h.position}</span>
                        <span style={{ fontSize: 11.5, color: '#8A97AB' }}>{fmtStamp(h.scheduledAt ?? h.createdAt)}</span>
                      </span>
                      <StatusPill s={h.status} /><ResultPill r={h.result} />
                    </button>
                  ))}
                </Panel>
              )}

              <Panel title="Trail" icon={IC.clock} bodyStyle={{ paddingTop: 0 }}>
                <div style={{ position: 'relative', paddingLeft: 4 }}>
                  {iv.events.map((e, i) => {
                    const m = EVENT[e.type] ?? { label: e.type, icon: IC.note, color: '#6B7280' }
                    const text = eventText(e)
                    return (
                      <div key={e.id} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i === iv.events.length - 1 ? 2 : 12 }}>
                        {i < iv.events.length - 1 && <span style={{ position: 'absolute', left: 12, top: 26, bottom: 0, width: 2, background: withAlpha(P.navy, 0.08) }} />}
                        <span style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(m.color, 0.12), color: m.color, zIndex: 1 }}><Svg d={m.icon} size={13} /></span>
                        <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: m.color === '#6B7280' ? P.navy : m.color }}>{m.label}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8A97AB', whiteSpace: 'nowrap' }}>{fmtStamp(e.createdAt)}</span>
                          </div>
                          {text && <div style={{ fontSize: 12.5, color: '#44526B', marginTop: 1, lineHeight: 1.45, wordBreak: 'break-word' }}>{text}</div>}
                          {e.actor && <div style={{ fontSize: 11, color: '#8A97AB', marginTop: 1 }}>by {e.actor.displayName}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <input className={cls} value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote() }} placeholder="Add a note to the trail" />
                  <Btn small tone="navy" onClick={addNote} disabled={!note.trim() || busy === 'note'}>Add</Btn>
                </div>
              </Panel>
            </div>

            {/* Right: the interview form */}
            <section style={{ minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, border: `1px solid ${withAlpha(P.navy, 0.07)}`, boxShadow: '0 10px 30px -24px rgba(19,46,87,0.5)', overflow: 'hidden' }}>
              <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${withAlpha(P.navy, 0.07)}`, flexShrink: 0, flexWrap: 'wrap' }}>
                <span style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(P.gold, 0.18), color: '#B7791F' }}><Svg d={IC.form} size={15} /></span>
                <div>
                  <div style={{ fontFamily: OUTFIT, fontSize: 15.5, fontWeight: 600, color: P.navy }}>Interview Form</div>
                  {questions.length > 0 && <div style={{ fontSize: 11.5, color: '#8A97AB' }}>{answeredCount} of {questions.length} answered{requiredLeft ? `, ${requiredLeft} required left` : ''}</div>}
                </div>
                <div style={{ width: 260, marginLeft: 'auto' }}>
                  <StyledSelect value={formId} disabled={readOnly} placeholder="Choose the interview form" onChange={v => { setFormId(v); setDirty(true) }}
                    options={forms.filter(f => f.isActive || f.id === formId).map(f => ({ value: f.id, label: f.kind === 'WALK_IN' ? `${f.name} (walk-in)` : f.name }))} />
                </div>
              </header>
              {questions.length > 0 && <div style={{ height: 3, background: '#EEF1F5', flexShrink: 0 }}><div style={{ height: 3, width: `${(answeredCount / questions.length) * 100}%`, background: `linear-gradient(90deg, ${P.teal}, #15803D)`, transition: 'width .3s' }} /></div>}

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
                {st === 'CANCELLED' && <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 9, background: '#F3F4F6', color: '#4B5563', fontSize: 12.5, fontWeight: 600 }}>This interview was cancelled. Use Book Again to give the candidate a new time.</div>}
                {st === 'SCHEDULED' && <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 9, background: '#EFF6FF', color: '#1D4ED8', fontSize: 12.5, fontWeight: 600 }}>The candidate has not arrived yet. Mark them as arrived when they come in, then fill the form during the interview.</div>}
                {done && !editingDone && <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 9, background: '#ECFDF5', color: '#15803D', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Completed on {fmtStamp(iv.completedAt)}. <button type="button" onClick={() => setEditingDone(true)} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: P.teal, fontWeight: 800, cursor: 'pointer', fontSize: 12.5 }}>Edit answers</button>
                </div>}
                {!formId && <div style={{ padding: '30px 10px', textAlign: 'center', color: '#8A97AB', fontSize: 13 }}>Choose the interview form at the top right to see its questions.</div>}
                {questions.map((q, i) => (
                  <div key={q.id} style={{ padding: '10px 12px', borderRadius: 12, marginBottom: 8, border: `1px solid ${answered(answers[q.id]) ? withAlpha(P.teal, 0.25) : '#EEF1F5'}`, background: answered(answers[q.id]) ? withAlpha(P.teal, 0.03) : '#FBFCFD' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
                      <span style={{ fontFamily: RAJDHANI, fontSize: 13, fontWeight: 700, color: P.teal, minWidth: 20 }}>{i + 1}.</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: P.navy, lineHeight: 1.4 }}>{q.label}{q.required && <span style={{ color: '#D62828' }}> *</span>}</span>
                    </div>
                    <div style={{ paddingLeft: 28 }}><Answer q={q} value={answers[q.id]} readOnly={readOnly} onChange={v => { setAnswers(a => ({ ...a, [q.id]: v })); setDirty(true) }} /></div>
                  </div>
                ))}

                {formId && (
                  <div style={{ marginTop: 6, padding: '12px 14px', borderRadius: 12, background: withAlpha(P.navy, 0.03), border: `1px solid ${withAlpha(P.navy, 0.07)}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', alignItems: 'center' }}>
                      <span style={{ fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall rating</span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} type="button" disabled={readOnly} onClick={() => { setRating(rating === n ? '' : n); setDirty(true) }} title={`${n} of 5`}
                            style={{ border: 0, background: 'transparent', padding: 1, cursor: readOnly ? 'default' : 'pointer', color: rating !== '' && n <= rating ? '#F2AC18' : '#D5DBE3' }}>
                            <svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor"><path d={IC.star} /></svg>
                          </button>
                        ))}
                      </div>
                      <span style={{ fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Result</span>
                      <div style={{ pointerEvents: readOnly ? 'none' : undefined }}>
                        <Segmented value={result} onChange={v => { setResult(v); setDirty(true) }} options={[['PENDING', 'Not decided'], ['SELECTED', 'Selected'], ['ON_HOLD', 'On hold'], ['REJECTED', 'Rejected']]}
                          colors={{ SELECTED: '#15803D', REJECTED: '#B91C1C', ON_HOLD: '#B45309', PENDING: '#6B7280' }} />
                      </div>
                      <span style={{ fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Interviewer</span>
                      <div style={{ maxWidth: 300 }}><StyledSelect value={interviewerId} disabled={readOnly} onChange={v => { setInterviewerId(v); setDirty(true) }} placeholder="Who took the interview"
                        options={(meta?.interviewers ?? []).map(u => ({ value: u.id, label: u.managerType ? `${u.displayName} (${u.managerType})` : u.displayName }))} /></div>
                      <span style={{ fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'start', paddingTop: 6 }}>Remarks</span>
                      <textarea className={`${cls} resize-none`} rows={3} value={remarks} readOnly={readOnly} onChange={e => { setRemarks(e.target.value); setDirty(true) }} placeholder="Overall impression, salary agreed, joining date, next step" />
                    </div>
                  </div>
                )}
              </div>

              {formId && !readOnly && (
                <footer style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: `1px solid ${withAlpha(P.navy, 0.07)}`, background: '#FAFBFC', flexShrink: 0 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: evalError ? '#B91C1C' : '#8A97AB', fontWeight: evalError ? 600 : 400 }}>
                    {evalError || (dirty ? 'Unsaved changes' : 'Save as you go; complete it with a result at the end.')}
                  </div>
                  {done && <Btn small onClick={() => take(iv)}>Discard</Btn>}
                  <Btn onClick={() => saveEval(false)} disabled={!!busy}>{busy === 'save' ? 'Saving...' : 'Save Answers'}</Btn>
                  <Btn tone="success" icon={IC.check} onClick={() => saveEval(true)} disabled={!!busy || result === 'PENDING'} title={result === 'PENDING' ? 'Choose the result first' : undefined}>
                    {busy === 'complete' ? 'Saving...' : done ? 'Update Result' : 'Complete Interview'}
                  </Btn>
                </footer>
              )}
            </section>
          </div>
        )}
      </aside>

      {iv && modal === 'candidate' && <CandidateModal mode="edit" meta={meta} interview={iv} onClose={() => setModal(null)} onSaved={x => after(x, 'Candidate updated')} />}
      {iv && modal && modal !== 'candidate' && (
        <ActionModal action={modal} iv={iv} meta={meta} onClose={() => setModal(null)}
          onDone={x => after(x, { reschedule: 'Interview rescheduled', cancel: 'Interview cancelled', noshow: 'Marked as no-show', details: 'Details saved', delete: '' }[modal])}
          onDeleted={() => { setModal(null); onChanged(); notify('Interview deleted'); onClose() }} />
      )}
    </>
  )
}
