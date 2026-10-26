'use client'

// Schedule an interview, register a walk-in, or edit a candidate's details. One dialog: the
// candidate and background on the left, the interview, CV and notes on the right.

import { useRef, useState } from 'react'
import { P } from '@/lib/palette'
import { apiPost, apiPut, errMsg } from '@/lib/api'
import { uploadFile, fileHref } from '@/lib/storage'
import StyledSelect from '@/components/ui/StyledSelect'
import DateInput from '@/components/ui/DateInput'
import { Field, Svg, withAlpha } from '@/components/sales/saleUi'
import { Modal, ModalHead, ModalFoot, ErrorBox, Btn, Segmented, IC, OUTFIT, todayPkt, pktParts, type Candidate, type InterviewFull, type Meta } from './shared'

const cls = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'

const opts = (list: string[], current?: string) => [...list, ...(current && !list.includes(current) ? [current] : [])].map(v => ({ value: v, label: v }))
const EDUCATION = ['Matric', 'Intermediate', 'Bachelors', 'Masters', 'Other']
const SHIFTS    = ['Day', 'Evening', 'Night', 'Any']
const SOURCES   = ['Walk-in', 'Referral', 'Facebook', 'LinkedIn', 'Indeed', 'Rozee.pk', 'Website', 'Other']
const GENDERS   = ['Male', 'Female', 'Other']
const DURATIONS = [15, 20, 30, 45, 60, 90].map(n => ({ value: String(n), label: `${n} minutes` }))

const CAND_KEYS = ['fullName', 'fatherName', 'phone', 'altPhone', 'email', 'cnic', 'gender', 'dateOfBirth', 'city', 'address',
  'education', 'experienceYears', 'callCenterYears', 'lastCompany', 'lastDesignation', 'currentSalary', 'expectedSalary',
  'preferredShift', 'availableFrom', 'source', 'referredBy', 'notes'] as const
type CandForm = Record<(typeof CAND_KEYS)[number], string>

function fromCandidate(c?: Candidate | null): CandForm {
  const out = {} as CandForm
  for (const k of CAND_KEYS) {
    const v = (c as any)?.[k]
    out[k] = v === null || v === undefined ? '' : (k === 'dateOfBirth' || k === 'availableFrom') ? String(v).slice(0, 10) : String(k === 'experienceYears' || k === 'callCenterYears' ? Number(v) : v)
  }
  return out
}

/** 3520211111111 -> 35202-1111111-1 */
const cnicFmt = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  return d.length <= 5 ? d : d.length <= 12 ? `${d.slice(0, 5)}-${d.slice(5)}` : `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(P.teal, 0.1), color: P.teal }}><Svg d={icon} size={13} /></span>
        <span style={{ fontFamily: OUTFIT, fontSize: 13.5, fontWeight: 600, color: P.navy }}>{title}</span>
        <span style={{ flex: 1, height: 1, background: withAlpha(P.navy, 0.07) }} />
      </div>
      {children}
    </div>
  )
}
const grid = (cols: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '9px 12px' })
const span = (n: number): React.CSSProperties => ({ gridColumn: `span ${n}`, minWidth: 0 })

export default function CandidateModal({ mode, meta, interview, onClose, onSaved }: {
  mode: 'schedule' | 'walkin' | 'edit'
  meta: Meta | null
  /** edit: the interview whose candidate is edited */
  interview?: InterviewFull | null
  onClose: () => void
  onSaved: (iv: InterviewFull) => void
}) {
  const [c, setC] = useState<CandForm>(() => fromCandidate(interview?.candidate))
  const [cv, setCv] = useState<{ key: string; name: string } | null>(interview?.candidate.cvKey ? { key: interview.candidate.cvKey, name: interview.candidate.cvName ?? 'CV' } : null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const forms = meta?.forms ?? []
  const firstWalkIn = forms.find(f => f.kind === 'WALK_IN')
  const [formId, setFormId] = useState(mode === 'walkin' ? firstWalkIn?.id ?? '' : '')
  const posFromForm = (id: string) => (forms.find(f => f.id === id)?.name ?? '').replace(/^Walk-in\s+/i, '')
  const [position, setPosition] = useState(() => mode === 'walkin' && firstWalkIn ? posFromForm(firstWalkIn.id) : '')
  const [date, setDate] = useState(todayPkt())
  const [time, setTime] = useState(() => { const t = pktParts(new Date(Date.now() + 60 * 60_000)); return `${t.time.slice(0, 2)}:00` })
  const [duration, setDuration] = useState('30')
  const [ivMode, setIvMode] = useState('In person')
  const [location, setLocation] = useState('')
  const [interviewerId, setInterviewerId] = useState('')
  const [sendEmail, setSendEmail] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof CandForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC(p => ({ ...p, [k]: e.target.value }))
  const pick = (k: keyof CandForm) => (v: string) => setC(p => ({ ...p, [k]: v }))
  const chooseForm = (id: string) => {
    if (!position || position === posFromForm(formId)) setPosition(posFromForm(id))
    setFormId(id)
  }

  async function onFile(f?: File | null) {
    if (!f) return
    if (f.size > 25 * 1024 * 1024) { setError('The CV must be under 25 MB.'); return }
    setUploading(true); setError('')
    try { const up = await uploadFile(f, 'cv'); setCv({ key: up.url, name: up.fileName }) }
    catch (e) { setError(errMsg(e, 'Could not upload the CV.')) }
    finally { setUploading(false) }
  }

  async function submit() {
    setError('')
    if (!c.fullName.trim()) return setError('Enter the candidate\'s full name.')
    if (!c.phone.trim()) return setError('Enter a phone number.')
    if (mode !== 'edit' && !position.trim()) return setError('Choose the interview form or type the position.')
    setSaving(true)
    try {
      const cand = { ...c, cvKey: cv?.key ?? '', cvName: cv?.name ?? '' }
      const details = { formId: formId || undefined, position, durationMin: duration, mode: ivMode, location, interviewerId: interviewerId || undefined }
      const iv = mode === 'edit' ? await apiPut<InterviewFull>(`/interviews/${interview!.id}/candidate`, cand)
        : mode === 'walkin' ? await apiPost<InterviewFull>('/interviews/walk-in', { ...cand, ...details })
        : await apiPost<InterviewFull>('/interviews', { ...cand, ...details, date, time, sendEmail: sendEmail && !!c.email.trim() })
      onSaved(iv)
    } catch (e) { setError(errMsg(e, 'Could not save.')) }
    finally { setSaving(false) }
  }

  const title = mode === 'edit' ? 'Edit Candidate' : mode === 'walkin' ? 'Walk-in Candidate' : 'Schedule Interview'
  const sub = mode === 'edit' ? interview?.candidate.fullName : mode === 'walkin' ? 'Someone who came in without an appointment; the interview starts now' : 'The candidate is emailed the date, time and position'

  return (
    <Modal width={1120} onClose={onClose}>
      <ModalHead title={title} sub={sub} icon={mode === 'walkin' ? IC.walk : mode === 'edit' ? IC.user : IC.calendar} onClose={onClose} />
      <div style={{ padding: '14px 18px 2px', overflowY: 'auto', flex: 1 }}>
        <ErrorBox text={error} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 22 }}>
          <div>
            <Section icon={IC.user} title="Candidate">
              <div style={grid(3)}>
                <Field label="Full name" required><input className={cls} value={c.fullName} onChange={set('fullName')} placeholder="As on CNIC" autoFocus /></Field>
                <Field label="Father name"><input className={cls} value={c.fatherName} onChange={set('fatherName')} /></Field>
                <Field label="Phone" required><input className={cls} value={c.phone} onChange={set('phone')} placeholder="03XX XXXXXXX" /></Field>
                <Field label="Alternate phone"><input className={cls} value={c.altPhone} onChange={set('altPhone')} /></Field>
                <Field label="Email"><input className={cls} type="email" value={c.email} onChange={set('email')} placeholder="name@example.com" /></Field>
                <Field label="CNIC"><input className={cls} value={c.cnic} onChange={e => setC(p => ({ ...p, cnic: cnicFmt(e.target.value) }))} placeholder="00000-0000000-0" maxLength={15} /></Field>
                <Field label="Gender"><StyledSelect value={c.gender} onChange={pick('gender')} options={opts(GENDERS, c.gender)} placeholder="Select" /></Field>
                <Field label="Date of birth"><DateInput value={c.dateOfBirth} onChange={set('dateOfBirth')} className={cls} max={todayPkt()} /></Field>
                <Field label="City"><input className={cls} value={c.city} onChange={set('city')} /></Field>
                <div style={span(3)}><Field label="Address"><input className={cls} value={c.address} onChange={set('address')} /></Field></div>
              </div>
            </Section>
            <Section icon={IC.briefcase} title="Background">
              <div style={grid(3)}>
                <Field label="Education"><StyledSelect value={c.education} onChange={pick('education')} options={opts(EDUCATION, c.education)} placeholder="Select" /></Field>
                <Field label="Total experience (years)"><input className={cls} type="number" min={0} step={0.5} value={c.experienceYears} onChange={set('experienceYears')} /></Field>
                <Field label="Call center (years)"><input className={cls} type="number" min={0} step={0.5} value={c.callCenterYears} onChange={set('callCenterYears')} /></Field>
                <Field label="Last company"><input className={cls} value={c.lastCompany} onChange={set('lastCompany')} /></Field>
                <Field label="Last designation"><input className={cls} value={c.lastDesignation} onChange={set('lastDesignation')} /></Field>
                <Field label="Preferred shift"><StyledSelect value={c.preferredShift} onChange={pick('preferredShift')} options={opts(SHIFTS, c.preferredShift)} placeholder="Select" /></Field>
                <Field label="Current salary (Rs)"><input className={cls} type="number" min={0} value={c.currentSalary} onChange={set('currentSalary')} /></Field>
                <Field label="Expected salary (Rs)"><input className={cls} type="number" min={0} value={c.expectedSalary} onChange={set('expectedSalary')} /></Field>
                <Field label="Can join from"><DateInput value={c.availableFrom} onChange={set('availableFrom')} className={cls} /></Field>
                <Field label="How they found us"><StyledSelect value={c.source} onChange={pick('source')} options={opts(SOURCES, c.source)} placeholder="Select" /></Field>
                <div style={span(2)}><Field label="Referred by"><input className={cls} value={c.referredBy} onChange={set('referredBy')} placeholder="Name of the employee, if referred" /></Field></div>
              </div>
            </Section>
          </div>

          <div>
            {mode !== 'edit' && (
              <Section icon={mode === 'walkin' ? IC.walk : IC.calendar} title="Interview">
                <div style={grid(2)}>
                  <Field label="Interview form"><StyledSelect value={formId} onChange={chooseForm} placeholder="Choose a form"
                    options={[...forms].sort((a, b) => (a.kind === (mode === 'walkin' ? 'WALK_IN' : 'SCHEDULED') ? -1 : 1) - (b.kind === (mode === 'walkin' ? 'WALK_IN' : 'SCHEDULED') ? -1 : 1)).map(f => ({ value: f.id, label: f.kind === 'WALK_IN' ? `${f.name} (walk-in)` : f.name }))} /></Field>
                  <Field label="Position" required><input className={cls} value={position} onChange={e => setPosition(e.target.value)} placeholder="e.g. Medicare Agent" /></Field>
                  {mode === 'schedule' && <>
                    <Field label="Date" required><DateInput value={date} onChange={e => setDate(e.target.value)} className={cls} min={todayPkt()} /></Field>
                    <Field label="Time (Pakistan)" required><input className={cls} type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
                    <Field label="Duration"><StyledSelect value={duration} onChange={setDuration} options={DURATIONS} /></Field>
                  </>}
                  <Field label="Interviewer"><StyledSelect value={interviewerId} onChange={setInterviewerId} placeholder="Select"
                    options={(meta?.interviewers ?? []).map(u => ({ value: u.id, label: u.managerType ? `${u.displayName} (${u.managerType})` : u.displayName }))} /></Field>
                  <div style={span(2)}>
                    <Field label="Mode"><Segmented value={ivMode} onChange={setIvMode} options={(meta?.modes ?? ['In person', 'Phone', 'Video']).map(m => [m, m] as [string, string])} /></Field>
                  </div>
                  {mode === 'schedule' && <div style={span(2)}><Field label={ivMode === 'Video' ? 'Meeting link' : ivMode === 'Phone' ? 'Note for the call' : 'Location'}>
                    <input className={cls} value={location} onChange={e => setLocation(e.target.value)} placeholder={ivMode === 'Video' ? 'Zoom, Meet or WhatsApp link' : ivMode === 'Phone' ? 'Optional' : 'e.g. Head office, 2nd floor'} />
                  </Field></div>}
                </div>
              </Section>
            )}

            <Section icon={IC.doc} title="CV">
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
              {cv ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1px solid ${withAlpha(P.teal, 0.3)}`, background: withAlpha(P.teal, 0.05) }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: '#fff', color: P.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Svg d={IC.doc} size={15} /></span>
                  <a href={fileHref(cv.key, { name: cv.name })} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: P.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{cv.name}</a>
                  <Btn small onClick={() => fileRef.current?.click()} disabled={uploading}>Replace</Btn>
                  <Btn small tone="danger" onClick={() => setCv(null)}>Remove</Btn>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 12px', borderRadius: 10, border: `1.5px dashed ${withAlpha(P.teal, 0.45)}`, background: '#F8FBFC', color: P.teal, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  <Svg d={IC.upload} size={16} />{uploading ? 'Uploading...' : 'Attach CV (PDF, Word or image)'}
                </button>
              )}
            </Section>

            <Section icon={IC.note} title="Notes">
              <textarea className={`${cls} resize-none`} rows={mode === 'edit' ? 8 : 3} value={c.notes} onChange={set('notes')} placeholder="Anything HR should know before the interview" />
            </Section>
          </div>
        </div>
      </div>
      <ModalFoot>
        {mode === 'schedule' && (
          <label style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: c.email.trim() ? P.navy : '#9CA3AF', cursor: c.email.trim() ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={sendEmail && !!c.email.trim()} disabled={!c.email.trim()} onChange={e => setSendEmail(e.target.checked)} style={{ accentColor: P.teal, width: 15, height: 15 }} />
            {c.email.trim() ? `Email the invitation to ${c.email.trim()}` : 'Add an email to send the invitation'}
          </label>
        )}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="primary" onClick={submit} disabled={saving || uploading} icon={mode === 'edit' ? IC.check : mode === 'walkin' ? IC.walk : IC.calendar}>
          {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : mode === 'walkin' ? 'Start Interview' : 'Schedule Interview'}
        </Btn>
      </ModalFoot>
    </Modal>
  )
}
