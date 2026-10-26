'use client'

// Types, labels and small pieces shared by the HR > Interviews screens.

import { useEffect, useState } from 'react'
import { P } from '@/lib/palette'
import { Svg, withAlpha, RAJDHANI } from '@/components/sales/saleUi'

export const OUTFIT = "'Outfit', 'Aptos', sans-serif"
export const FONT   = "'Aptos', sans-serif"
export const TZ     = 'Asia/Karachi'
/** The reminder popup asks an already open Interviews page to show one interview. */
export const OPEN_INTERVIEW_EVENT = 'interviews:open'
/** Fired after any change on the Interviews page, so the reminder popup re-checks what is due. */
export const INTERVIEWS_CHANGED_EVENT = 'interviews:changed'

export type Kind   = 'SCHEDULED' | 'WALK_IN'
export type Status = 'SCHEDULED' | 'ARRIVED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'
export type Result = 'PENDING' | 'SELECTED' | 'REJECTED' | 'ON_HOLD'
export type QType  = 'text' | 'textarea' | 'rating' | 'yesno' | 'choice' | 'number'

export interface Question { id: string; label: string; type: QType; options?: string[]; required?: boolean }
export interface Person { id: string; displayName: string }

export interface Candidate {
  id: string; fullName: string; fatherName?: string | null; email?: string | null; phone: string; altPhone?: string | null
  cnic?: string | null; gender?: string | null; dateOfBirth?: string | null; city?: string | null; address?: string | null
  education?: string | null; experienceYears?: string | number | null; callCenterYears?: string | number | null
  lastCompany?: string | null; lastDesignation?: string | null; currentSalary?: number | null; expectedSalary?: number | null
  preferredShift?: string | null; availableFrom?: string | null; source?: string | null; referredBy?: string | null
  cvKey?: string | null; cvName?: string | null; notes?: string | null
}

export interface InterviewRow {
  id: string; position: string; kind: Kind; status: Status; result: Result; scheduledAt: string | null
  durationMin: number; mode: string; location?: string | null; rescheduleCount: number; rating?: number | null
  arrivedAt?: string | null; completedAt?: string | null; createdAt: string
  candidate: Pick<Candidate, 'id' | 'fullName' | 'phone' | 'email' | 'city' | 'cvKey' | 'cvName'>
  interviewer?: Person | null; form?: { id: string; name: string } | null
}

export interface InterviewEvent { id: string; type: string; note?: string | null; data?: any; createdAt: string; actor?: Person | null }

export interface InterviewFull extends Omit<InterviewRow, 'candidate' | 'form'> {
  candidate: Candidate; formId?: string | null; interviewerId?: string | null
  form?: { id: string; name: string; kind: Kind; questions: Question[]; isActive: boolean } | null
  formSnapshot?: Question[] | null; answers?: Record<string, any> | null; remarks?: string | null
  createdBy?: Person | null; events: InterviewEvent[]
  history: { id: string; position: string; kind: Kind; status: Status; result: Result; scheduledAt: string | null; createdAt: string }[]
}

export interface FormSummary { id: string; name: string; kind: Kind; description?: string | null }
export interface FormFull extends FormSummary { questions: Question[]; isActive: boolean; sortOrder: number; used: number }
export interface Meta { forms: FormSummary[]; interviewers: (Person & { role: string; managerType?: string | null })[]; modes: string[] }

export const STATUS: Record<Status, { label: string; color: string }> = {
  SCHEDULED: { label: 'Scheduled', color: '#2563EB' },
  ARRIVED:   { label: 'Waiting',   color: '#D97706' },
  COMPLETED: { label: 'Completed', color: '#15803D' },
  NO_SHOW:   { label: 'No-show',   color: '#B91C1C' },
  CANCELLED: { label: 'Cancelled', color: '#6B7280' },
}
export const RESULT: Record<Result, { label: string; color: string }> = {
  PENDING:  { label: 'Pending',  color: '#6B7280' },
  SELECTED: { label: 'Selected', color: '#15803D' },
  REJECTED: { label: 'Rejected', color: '#B91C1C' },
  ON_HOLD:  { label: 'On hold',  color: '#B45309' },
}
export const QTYPE_LABEL: Record<QType, string> = {
  text: 'Short answer', textarea: 'Long answer', rating: 'Rating 1 to 5', yesno: 'Yes / No', choice: 'Pick one', number: 'Number',
}

export const IC = {
  user:     'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  clock:    'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  walk:     'M13.5 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM9 21l2.25-6.75L13.5 16.5V21m-6-9.75 3-3h3l2.25 3.75L18 13.5',
  check:    'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  star:     'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z',
  x:        'M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  phone:    'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z',
  mail:     'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
  doc:      'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z',
  form:     'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z',
  briefcase:'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0',
  refresh:  'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
  note:     'M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125',
  bell:     'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
  trash:    'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
  plus:     'M12 4.5v15m7.5-7.5h-15',
  up:       'm4.5 15.75 7.5-7.5 7.5 7.5',
  down:     'm19.5 8.25-7.5 7.5-7.5-7.5',
  copy:     'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75',
  upload:   'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5',
}

// ── Time (everything is shown and typed in Pakistan time) ───────────────────

const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]))
/** { date: 'YYYY-MM-DD', time: 'HH:MM' } in PKT */
export function pktParts(d: Date | string) { const p = parts(new Date(d)); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` } }
export const todayPkt = () => pktParts(new Date()).date
export const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : ''
export const fmtTime = (d?: string | null) => d ? new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : ''
export const fmtDay  = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' }) : ''
export const fmtStamp = (d?: string | null) => d ? `${fmtDate(d)}, ${fmtTime(d)}` : ''
export const fmtDob = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : ''

/** "in 25 min", "3 h 10 min ago", "Tomorrow" style hint next to a time. */
export function relTime(d: string, now = Date.now()) {
  const mins = Math.round((new Date(d).getTime() - now) / 60_000)
  const abs = Math.abs(mins)
  const span = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}` : `${Math.round(abs / 1440)} day${Math.round(abs / 1440) > 1 ? 's' : ''}`
  if (abs < 1) return 'now'
  return mins > 0 ? `in ${span}` : `${span} ago`
}

/** Re-renders every `ms` so countdowns stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export const money = (n?: number | null) => n === null || n === undefined ? '' : `Rs ${Number(n).toLocaleString('en-PK')}`
export const years = (n?: string | number | null) => n === null || n === undefined || n === '' ? '' : `${Number(n)} yr${Number(n) === 1 ? '' : 's'}`
/** 0300 1234567 -> 923001234567 for WhatsApp links */
export const waNumber = (phone: string) => { const d = phone.replace(/\D/g, ''); return d.startsWith('0') ? `92${d.slice(1)}` : d }

// ── Small UI ────────────────────────────────────────────────────────────────

export function Pill({ color, children, solid }: { color: string; children: React.ReactNode; solid?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.02em',
      background: solid ? color : withAlpha(color, 0.12), color: solid ? '#fff' : color }}>
      {!solid && <span style={{ width: 6, height: 6, borderRadius: 99, background: color }} />}
      {children}
    </span>
  )
}
export const StatusPill = ({ s }: { s: Status }) => <Pill color={STATUS[s].color}>{STATUS[s].label}</Pill>
export const ResultPill = ({ r }: { r: Result }) => r === 'PENDING' ? null : <Pill color={RESULT[r].color}>{RESULT[r].label}</Pill>

/** Centered dialog on a dimmed page. */
export function Modal({ children, width = 520, onClose }: { children: React.ReactNode; width?: number; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(19,46,87,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: width, maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px -20px rgba(19,46,87,0.5)', overflow: 'hidden', fontFamily: FONT }}>
        {children}
      </div>
    </div>
  )
}

/** Gradient title band of a dialog. */
export function ModalHead({ title, sub, icon, onClose, tone = 'teal' }: { title: string; sub?: string; icon: string; onClose: () => void; tone?: 'teal' | 'red' | 'amber' }) {
  const bg = tone === 'red' ? 'linear-gradient(135deg, #FDECEC 0%, #F8D4D4 100%)' : tone === 'amber' ? 'linear-gradient(135deg, #FFF6E5 0%, #FBE6BC 100%)' : `linear-gradient(135deg, ${withAlpha(P.teal, 0.12)} 0%, ${withAlpha(P.navy, 0.1)} 100%)`
  const fg = tone === 'red' ? '#B91C1C' : tone === 'amber' ? '#B45309' : P.teal
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: bg, flexShrink: 0 }}>
      <span style={{ width: 34, height: 34, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: fg, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}><Svg d={icon} size={17} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: OUTFIT, fontSize: 17, fontWeight: 600, color: P.navy }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: '#5C6D82', marginTop: 1 }}>{sub}</div>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 9, border: 0, background: 'rgba(255,255,255,0.7)', color: P.navy, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
    </div>
  )
}

export function ModalFoot({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: `1px solid ${P.border}`, background: '#FAFBFC', flexShrink: 0 }}>{children}</div>
}

export function ErrorBox({ text }: { text: string }) {
  if (!text) return null
  return <div style={{ margin: '0 0 12px', padding: '9px 12px', borderRadius: 9, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12.5, fontWeight: 600 }}>{text}</div>
}

/** Rounded button used across the module. */
export function Btn({ children, onClick, tone = 'ghost', disabled, small, icon, title, type = 'button' }: {
  children?: React.ReactNode; onClick?: () => void; tone?: 'primary' | 'ghost' | 'danger' | 'success' | 'amber' | 'navy'; disabled?: boolean; small?: boolean; icon?: string; title?: string; type?: 'button' | 'submit'
}) {
  const look: Record<string, React.CSSProperties> = {
    primary: { background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', border: 0 },
    navy:    { background: P.navy, color: '#fff', border: 0 },
    success: { background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)', color: '#fff', border: 0 },
    danger:  { background: '#fff', color: '#B91C1C', border: '1px solid #F5C2C2' },
    amber:   { background: '#fff', color: '#B45309', border: '1px solid #F3D9A4' },
    ghost:   { background: '#fff', color: P.navy, border: `1px solid ${P.border}` },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: small ? '5px 10px' : '8px 15px', borderRadius: 9, fontSize: small ? 12 : 13, fontWeight: 700, fontFamily: FONT,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap', ...look[tone] }}>
      {icon && <Svg d={icon} size={small ? 13 : 14} />}{children}
    </button>
  )
}

/** Segmented control: a row of options with one chosen. */
export function Segmented<T extends string>({ value, onChange, options, colors }: { value: T; onChange: (v: T) => void; options: [T, string][]; colors?: Partial<Record<T, string>> }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 10, background: '#F1F4F7', flexWrap: 'wrap' }}>
      {options.map(([v, label]) => {
        const on = v === value, c = colors?.[v] ?? P.teal
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{ padding: '5px 12px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: FONT, whiteSpace: 'nowrap',
              background: on ? '#fff' : 'transparent', color: on ? c : '#5C6D82', boxShadow: on ? `0 1px 4px rgba(0,0,0,0.08), inset 0 0 0 1.5px ${withAlpha(c, 0.5)}` : 'none' }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Card with an icon bubble heading, as on the Profile page. */
export function Panel({ title, icon, action, children, style, bodyStyle }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties; bodyStyle?: React.CSSProperties }) {
  return (
    <section style={{ background: '#fff', borderRadius: 16, border: `1px solid ${withAlpha(P.navy, 0.07)}`, boxShadow: '0 10px 30px -24px rgba(19,46,87,0.5)', display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 8px', flexShrink: 0 }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(P.teal, 0.1), color: P.teal }}><Svg d={icon} size={14} /></span>
        <h3 style={{ margin: 0, fontFamily: OUTFIT, fontSize: 14.5, fontWeight: 600, color: P.navy }}>{title}</h3>
        {action && <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{action}</div>}
      </header>
      <div style={{ padding: '4px 16px 14px', minHeight: 0, ...bodyStyle }}>{children}</div>
    </section>
  )
}

/** Small label over a value, for read-only details. */
export function Detail({ label, children, span = 1 }: { label: string; children?: React.ReactNode; span?: number }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <div style={{ fontFamily: RAJDHANI, fontSize: 11.5, fontWeight: 700, color: '#8A97AB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: empty ? '#A3ADBB' : P.navy, wordBreak: 'break-word', marginTop: 1 }}>{empty ? 'Not entered' : children}</div>
    </div>
  )
}

/** Copies text and shows a tick for a moment. */
export function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" title="Copy" onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200) }).catch(() => {}) }}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: `1px solid ${P.border}`, background: done ? '#ECFDF5' : '#fff', color: done ? '#15803D' : '#5C6D82', cursor: 'pointer', flexShrink: 0 }}>
      {done ? <span style={{ fontSize: 11, fontWeight: 800 }}>✓</span> : <Svg d={IC.copy} size={12} />}
    </button>
  )
}

export const WhatsAppIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.43 9.43 0 0 1-1.44-5.02C2.62 6.85 6.85 2.6 12.06 2.6c2.52 0 4.89.99 6.67 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.2-4.24 9.45-9.44 9.45M20.08 3.98A11.3 11.3 0 0 0 12.05.67C5.8.67.7 5.76.7 12.02c0 2 .52 3.95 1.52 5.67L.6 23.33l5.77-1.51a11.33 11.33 0 0 0 5.67 1.45h.01c6.25 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.02" /></svg>
)
