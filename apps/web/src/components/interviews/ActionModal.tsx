'use client'

// Small dialogs for one interview: reschedule, cancel, no-show, delete and editing the details.

import { useState } from 'react'
import { P } from '@/lib/palette'
import { apiDelete, apiPost, apiPut, errMsg } from '@/lib/api'
import StyledSelect from '@/components/ui/StyledSelect'
import DateInput from '@/components/ui/DateInput'
import { Field } from '@/components/sales/saleUi'
import { Modal, ModalHead, ModalFoot, ErrorBox, Btn, Segmented, IC, todayPkt, pktParts, fmtStamp, type InterviewFull, type Meta } from './shared'

const cls = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20'

export type Action = 'reschedule' | 'cancel' | 'noshow' | 'delete' | 'details'

export default function ActionModal({ action, iv, meta, onClose, onDone, onDeleted }: {
  action: Action; iv: InterviewFull; meta: Meta | null
  onClose: () => void; onDone: (iv: InterviewFull) => void; onDeleted: () => void
}) {
  const start = iv.scheduledAt && new Date(iv.scheduledAt).getTime() > Date.now() ? pktParts(iv.scheduledAt) : { date: todayPkt(), time: pktParts(new Date(Date.now() + 60 * 60_000)).time.slice(0, 2) + ':00' }
  const [date, setDate] = useState(start.date)
  const [time, setTime] = useState(start.time)
  const [reason, setReason] = useState('')
  const hasEmail = !!iv.candidate.email
  const [sendEmail, setSendEmail] = useState(action === 'reschedule')
  const [d, setD] = useState({ formId: iv.formId ?? '', position: iv.position, durationMin: String(iv.durationMin), mode: iv.mode, location: iv.location ?? '', interviewerId: iv.interviewerId ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const again = iv.status === 'NO_SHOW' || iv.status === 'CANCELLED'
  const head = {
    reschedule: { title: again ? 'Book Again' : 'Reschedule Interview', sub: iv.scheduledAt ? `Currently ${fmtStamp(iv.scheduledAt)}` : 'Choose the new time', icon: IC.refresh, tone: 'amber' as const },
    cancel:     { title: 'Cancel Interview', sub: `${iv.candidate.fullName}, ${iv.position}`, icon: IC.x, tone: 'red' as const },
    noshow:     { title: 'Mark as No-show', sub: `${iv.candidate.fullName} did not come`, icon: IC.x, tone: 'red' as const },
    delete:     { title: 'Delete Interview', sub: 'This removes the interview and its full trail', icon: IC.trash, tone: 'red' as const },
    details:    { title: 'Interview Details', sub: `${iv.candidate.fullName}`, icon: IC.form, tone: 'teal' as const },
  }[action]

  async function go() {
    setBusy(true); setError('')
    try {
      if (action === 'delete') { await apiDelete(`/interviews/${iv.id}`); onDeleted(); return }
      const out = action === 'reschedule' ? await apiPost<InterviewFull>(`/interviews/${iv.id}/reschedule`, { date, time, reason, sendEmail: sendEmail && hasEmail })
        : action === 'cancel' ? await apiPost<InterviewFull>(`/interviews/${iv.id}/cancel`, { reason, sendEmail: sendEmail && hasEmail })
        : action === 'noshow' ? await apiPost<InterviewFull>(`/interviews/${iv.id}/no-show`, { note: reason })
        : await apiPut<InterviewFull>(`/interviews/${iv.id}`, { ...d, formId: d.formId || null, interviewerId: d.interviewerId || null })
      onDone(out)
    } catch (e) { setError(errMsg(e, 'Could not save.')) }
    finally { setBusy(false) }
  }

  const emailBox = (label: string) => hasEmail && (action !== 'cancel' || iv.status === 'SCHEDULED') && (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, fontWeight: 600, color: P.navy, cursor: 'pointer' }}>
      <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} style={{ accentColor: P.teal, width: 15, height: 15 }} />
      {label} {iv.candidate.email}
    </label>
  )

  return (
    <Modal width={action === 'details' ? 620 : 480} onClose={onClose}>
      <ModalHead title={head.title} sub={head.sub} icon={head.icon} tone={head.tone} onClose={onClose} />
      <div style={{ padding: '16px 18px', overflowY: 'auto' }}>
        <ErrorBox text={error} />
        {action === 'reschedule' && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="New date" required><DateInput value={date} onChange={e => setDate(e.target.value)} className={cls} min={todayPkt()} /></Field>
            <Field label="New time (Pakistan)" required><input type="time" className={cls} value={time} onChange={e => setTime(e.target.value)} /></Field>
          </div>
          <div style={{ marginTop: 12 }}><Field label="Reason"><textarea className={`${cls} resize-none`} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Candidate asked for another day" /></Field></div>
          {emailBox('Email the new time to')}
          {iv.rescheduleCount > 0 && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#B45309', fontWeight: 600 }}>Already rescheduled {iv.rescheduleCount} time{iv.rescheduleCount > 1 ? 's' : ''}.</p>}
        </>}
        {action === 'cancel' && <>
          <Field label="Reason"><textarea className={`${cls} resize-none`} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Position filled" /></Field>
          {emailBox('Let the candidate know at')}
        </>}
        {action === 'noshow' && <Field label="Note"><textarea className={`${cls} resize-none`} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Phone switched off, no reply on WhatsApp" /></Field>}
        {action === 'delete' && <p style={{ margin: 0, fontSize: 13.5, color: P.navy, lineHeight: 1.6 }}>
          Delete the <strong>{iv.position}</strong> interview of <strong>{iv.candidate.fullName}</strong>? The answers and the trail go with it, and this cannot be undone. To keep the record, cancel it instead.
        </p>}
        {action === 'details' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Interview form"><StyledSelect value={d.formId} onChange={v => setD(p => ({ ...p, formId: v }))} placeholder="Choose a form" options={(meta?.forms ?? []).map(f => ({ value: f.id, label: f.kind === 'WALK_IN' ? `${f.name} (walk-in)` : f.name }))} /></Field>
            <Field label="Position" required><input className={cls} value={d.position} onChange={e => setD(p => ({ ...p, position: e.target.value }))} /></Field>
            <Field label="Interviewer"><StyledSelect value={d.interviewerId} onChange={v => setD(p => ({ ...p, interviewerId: v }))} placeholder="Select" options={(meta?.interviewers ?? []).map(u => ({ value: u.id, label: u.managerType ? `${u.displayName} (${u.managerType})` : u.displayName }))} /></Field>
            <Field label="Duration"><StyledSelect value={d.durationMin} onChange={v => setD(p => ({ ...p, durationMin: v }))} options={[15, 20, 30, 45, 60, 90].map(n => ({ value: String(n), label: `${n} minutes` }))} /></Field>
            <div style={{ gridColumn: 'span 2' }}><Field label="Mode"><Segmented value={d.mode} onChange={v => setD(p => ({ ...p, mode: v }))} options={(meta?.modes ?? ['In person', 'Phone', 'Video']).map(m => [m, m] as [string, string])} /></Field></div>
            <div style={{ gridColumn: 'span 2' }}><Field label={d.mode === 'Video' ? 'Meeting link' : d.mode === 'Phone' ? 'Note for the call' : 'Location'}><input className={cls} value={d.location} onChange={e => setD(p => ({ ...p, location: e.target.value }))} /></Field></div>
          </div>
        )}
      </div>
      <ModalFoot>
        <Btn onClick={onClose}>{action === 'delete' || action === 'cancel' ? 'Keep it' : 'Cancel'}</Btn>
        <Btn tone={action === 'delete' || action === 'cancel' || action === 'noshow' ? 'danger' : 'primary'} onClick={go} disabled={busy}>
          {busy ? 'Saving...' : { reschedule: again ? 'Book Again' : 'Reschedule', cancel: 'Cancel Interview', noshow: 'Mark No-show', delete: 'Delete', details: 'Save' }[action]}
        </Btn>
      </ModalFoot>
    </Modal>
  )
}
