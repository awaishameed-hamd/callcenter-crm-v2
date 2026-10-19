'use client'

// My Profile: a modern profile view on one screen. Header card with a cover banner, photo (shared
// with the sidebar), name, role and quick facts; below it Contact, Salary, Identity & Address, a
// bank-card style Bank Details and Security (change password). "Edit Profile" opens a side panel
// with the form from CRM Management > User Form; HR-only values (joining date, department,
// salary) stay read-only.

import { useState, useEffect, useMemo, useRef } from 'react'
import { STANDARD_FIELD_KEYS, snakeToCamel } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAuth } from '@/contexts/AuthContext'
import { useCompact } from '@/hooks/useMediaQuery'
import { apiGet, apiPut, errMsg, errFields } from '@/lib/api'
import { useAvatar } from '@/lib/avatar'
import { fmtDay } from '@/lib/format'
import { roleLabel } from '@/lib/roles'
import { P } from '@/lib/palette'
import { inputCls, withAlpha, ICONS, Svg, Field } from '@/components/sales/saleUi'
import type { FormField, User } from '@/types'

const OUTFIT = "'Outfit', 'Aptos', sans-serif"
const FONT   = "'Aptos', sans-serif"
const GOLD   = '#C8902A'

const CORE_KEYS     = new Set(['display_name', ...STANDARD_FIELD_KEYS.user])
const READONLY_KEYS = new Set(['date_of_joining', 'department', 'basic_salary', 'punctuality_allowance', 'travelling_allowance', 'other_allowance'])
const SALARY_KEYS   = ['basic_salary', 'punctuality_allowance', 'travelling_allowance', 'other_allowance']
const SALARY_COLORS = [P.teal, '#F2AC18', P.navy, P.brick]
const CONTACT_KEYS  = ['email', 'phone', 'date_of_birth', 'experience']
const IDENTITY_KEYS = ['cnic', 'permanent_address', 'current_address']
const BANK_KEYS     = ['bank', 'account_title', 'bank_account_no', 'iban_no']
const HEADER_KEYS   = ['first_name', 'mid_name', 'last_name', 'father_name', 'date_of_joining', 'department']
const PLACED        = new Set([...CONTACT_KEYS, ...IDENTITY_KEYS, ...BANK_KEYS, ...SALARY_KEYS, ...HEADER_KEYS])
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }

const EXTRA_ICONS: Record<string, string> = {
  email: ICONS.mail, phone: ICONS.phone, date_of_birth: ICONS.calendar, experience: ICONS.tag,
  cnic: ICONS.id, permanent_address: ICONS.address, current_address: ICONS.address,
}

function formatCNIC(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (d.length <= 5) return d
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}
const pkr = (v: number) => `PKR ${v.toLocaleString('en-PK')}`
const valueOf = (u: User, key: string) => {
  const v = (u as unknown as Record<string, unknown>)[snakeToCamel(key)]
  return v === null || v === undefined ? '' : String(v).slice(0, key.startsWith('date_') ? 10 : undefined)
}
/** "2 yrs 3 mos" since the joining date. */
function tenure(iso?: string | null) {
  if (!iso) return null
  const start = new Date(iso.slice(0, 10)), now = new Date()
  let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
  if (now.getDate() < start.getDate()) months--
  if (months < 1) return 'New joiner'
  const y = Math.floor(months / 12), m = months % 12
  return [y && `${y} yr${y > 1 ? 's' : ''}`, m && `${m} mo${m > 1 ? 's' : ''}`].filter(Boolean).join(' ')
}
/** 0..4 for the strength meter. */
function strength(pw: string) {
  if (!pw) return 0
  return [pw.length >= 8, /[A-Z]/.test(pw) && /[a-z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Card({ title, icon, action, children, style }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ flex: 1, background: '#fff', borderRadius: 18, border: `1px solid ${withAlpha(P.navy, 0.07)}`, boxShadow: '0 10px 30px -22px rgba(19,46,87,0.45)', padding: '12px 16px', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(P.teal, 0.1), color: P.teal }}>
          <Svg d={icon} size={15} />
        </span>
        <h2 style={{ margin: 0, fontFamily: OUTFIT, fontSize: 15, fontWeight: 600, color: P.navy, letterSpacing: '-0.01em' }}>{title}</h2>
        {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </section>
  )
}

const Empty = ({ text = 'Not added yet' }: { text?: string }) => <span style={{ color: '#A3ADBB', fontStyle: 'italic', fontWeight: 400 }}>{text}</span>

/** Icon bubble, small label, value: one line of the Contact / Identity cards. */
function InfoRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '7px 0', borderBottom: `1px dashed ${withAlpha(P.navy, 0.08)}` }}>
      <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F6F9', color: P.slate }}>
        <Svg d={icon} size={15} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#8A97AB', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ marginTop: 1, fontSize: 13.5, fontWeight: 600, color: P.navy, wordBreak: 'break-word', lineHeight: 1.45 }}>{children}</div>
      </div>
    </div>
  )
}

/** Quick fact in the header strip. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: '0 18px', borderLeft: `1px solid ${withAlpha(P.navy, 0.08)}`, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8A97AB', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ marginTop: 2, fontFamily: OUTFIT, fontSize: 16, fontWeight: 600, color: P.navy, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

/** A form field inside the edit panel. */
function EditField({ field, value, onChange, error }: { field: FormField; value: string; onChange: (k: string, v: string) => void; error?: string }) {
  const cls = `${inputCls} ${error ? 'border-red-400' : ''}`
  const handle = (e: React.ChangeEvent<any>) => onChange(field.fieldKey, e.target.value)
  let input: React.ReactNode
  switch (field.fieldType) {
    case 'date':     input = <DateInput value={value} onChange={handle} className={cls} />; break
    case 'number':   input = <input type="number" value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={cls} />; break
    case 'textarea': input = <textarea value={value} onChange={handle} placeholder={field.placeholder ?? ''} rows={field.textareaRows || 2} className={`${cls} resize-none`} />; break
    case 'select':
      input = <StyledSelect value={value} onChange={v => onChange(field.fieldKey, v)} placeholder="Select" borderColor={error ? '#f87171' : undefined} options={(field.options ?? []).map(o => ({ value: o, label: o }))} />
      break
    default:
      input = field.fieldKey === 'cnic'
        ? <input type="text" value={value} onChange={e => onChange(field.fieldKey, formatCNIC(e.target.value))} placeholder={field.placeholder ?? '00000-0000000-0'} maxLength={15} className={cls} />
        : <input type={field.fieldKey === 'email' ? 'email' : 'text'} value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={cls} />
  }
  return <div style={{ gridColumn: `span ${COL_SPAN[field.colSpan] ?? 2}`, minWidth: 0 }}><Field label={field.label} required={field.isRequired} error={error}>{input}</Field></div>
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user: me, updateUser } = useAuth()
  const compact = useCompact()
  const { avatar, save: saveAvatar, remove: removeAvatar } = useAvatar()
  const fileRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<User | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState<Record<string, string>>({})
  const [extra, setExtra]     = useState<Record<string, string>>({})
  const [fields, setFields]   = useState<FormField[]>([])
  const [pw, setPw]           = useState({ currentPassword: '', newPassword: '', newPasswordConfirmation: '' })
  const [errors, setErrors]   = useState<Record<string, string[]>>({})
  const [pwError, setPwError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = (u: User) => {
    setProfile(u)
    setForm(Object.fromEntries([...CORE_KEYS].map(k => [k, valueOf(u, k)])))
    setExtra(Object.fromEntries(Object.entries(u.extraFields ?? {}).map(([k, v]) => [k, v === null ? '' : String(v)])))
  }
  useEffect(() => { apiGet<User>('/auth/me').then(load).catch(() => {}) }, [])
  useEffect(() => { apiGet<FormField[]>('/crm/form-fields/public', { formType: 'user' }).then(setFields).catch(() => {}) }, [])

  const byKey    = useMemo(() => Object.fromEntries(fields.map(f => [f.fieldKey, f])), [fields])
  const sections = useMemo(() => {
    const order: string[] = [], grouped: Record<string, FormField[]> = {}
    fields.forEach(f => {
      const s = f.section || 'General'
      if (!grouped[s]) { grouped[s] = []; order.push(s) }
      grouped[s].push(f)
    })
    return order.map(name => ({ name, list: grouped[name] }))
  }, [fields])

  const onField = (key: string, val: string) => {
    if (CORE_KEYS.has(key)) setForm(p => ({ ...p, [key]: val }))
    else setExtra(p => ({ ...p, [key]: val }))
  }
  const fieldValue = (key: string) => (CORE_KEYS.has(key) ? form[key] : extra[key]) ?? ''

  const save = async () => {
    setLoading(true); setErrors({})
    try {
      const payload: Record<string, unknown> = {}
      for (const k of CORE_KEYS) if (!READONLY_KEYS.has(k)) payload[snakeToCamel(k)] = form[k] === '' ? null : form[k]
      payload.extraFields = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== ''))
      const u = await apiPut<User>('/profile', payload)
      load(u)
      updateUser({ displayName: u.displayName })
      setEditing(false)
      setToast({ message: 'Profile updated successfully.', type: 'success' })
    } catch (e) {
      setErrors(errFields(e))
      setToast({ message: errMsg(e, 'Update failed.'), type: 'error' })
    } finally { setLoading(false) }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwLoading(true); setPwError('')
    try {
      await apiPut('/profile/password', pw)
      setPw({ currentPassword: '', newPassword: '', newPasswordConfirmation: '' })
      setToast({ message: 'Password changed successfully.', type: 'success' })
    } catch (err) {
      const m = errMsg(err, 'Password change failed.')
      setPwError(m)
      setToast({ message: m, type: 'error' })
    } finally { setPwLoading(false) }
  }

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    saveAvatar(file)
      .then(() => setToast({ message: 'Profile photo updated.', type: 'success' }))
      .catch(err => setToast({ message: err?.message || 'Could not use that image.', type: 'error' }))
  }

  if (!profile) {
    return (
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        <div className="animate-pulse" style={{ height: 190, borderRadius: 18, background: '#fff' }} />
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse" style={{ height: 300, borderRadius: 18, background: '#fff' }} />)}
        </div>
      </div>
    )
  }

  const locked   = profile.profileLocked
  const roleType = profile.agentType ?? profile.managerType ?? null
  const shows    = (k: string) => !!byKey[k]
  const val      = (k: string) => (CORE_KEYS.has(k) ? valueOf(profile, k) : (extra[k] ?? ''))
  const labelOf  = (k: string, fallback: string) => byKey[k]?.label ?? fallback
  const err      = (k: string) => errors[snakeToCamel(k)]?.[0]

  const salary      = SALARY_KEYS.filter(shows).map((k, i) => ({ key: k, label: labelOf(k, k), value: parseFloat(valueOf(profile, k)) || 0, color: SALARY_COLORS[i % SALARY_COLORS.length] }))
  const salaryTotal = salary.reduce((s, x) => s + x.value, 0)
  const moreFields  = fields.filter(f => !PLACED.has(f.fieldKey))
  const pwScore     = strength(pw.newPassword)
  const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 12, border: 0, cursor: 'pointer', background: `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`, color: '#fff', fontFamily: OUTFIT, fontSize: 13.5, fontWeight: 600, boxShadow: '0 10px 22px -12px rgba(30,132,150,0.9)', whiteSpace: 'nowrap' }

  // ── Header: cover banner, photo, name, quick facts ─────────────────────────
  const header = (
    <section style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', flexShrink: 0, border: `1px solid ${withAlpha(P.navy, 0.07)}`, boxShadow: '0 14px 34px -24px rgba(19,46,87,0.55)' }}>
      <div style={{ position: 'relative', height: 74,
        background: `radial-gradient(420px 160px at 88% 10%, ${withAlpha('#F2AC18', 0.38)}, transparent 70%), radial-gradient(520px 220px at 6% 120%, ${withAlpha('#2BB3C8', 0.55)}, transparent 70%), linear-gradient(120deg, ${P.navy} 0%, #1A4672 48%, ${P.teal} 100%)` }}>
        {/* fine diagonal texture */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 14px)' }} />
        <div style={{ position: 'absolute', right: 20, top: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          {locked ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, backdropFilter: 'blur(6px)' }}>
              <Svg d={ICONS.lock} size={14} /> Profile locked by admin
            </span>
          ) : (
            <button type="button" onClick={() => { setErrors({}); setEditing(true) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', fontFamily: OUTFIT, fontSize: 13.5, fontWeight: 600, backdropFilter: 'blur(6px)' }}>
              <Svg d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" size={14} /> Edit Profile
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: compact ? 'wrap' : 'nowrap', gap: 16, padding: '0 22px 12px' }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
        <div style={{ position: 'relative', marginTop: -40, flexShrink: 0, padding: 3, borderRadius: '50%', background: `conic-gradient(from 210deg, ${P.teal}, #F2AC18, ${P.teal}, #2BB3C8, ${P.teal})`, boxShadow: '0 14px 28px -12px rgba(19,46,87,0.55)' }}>
          <button type="button" onClick={() => fileRef.current?.click()} title="Change profile photo"
            style={{ width: 88, height: 88, borderRadius: '50%', padding: 0, cursor: 'pointer', border: '4px solid #fff', background: `linear-gradient(135deg, ${P.teal}, ${P.navy})`, boxShadow: '0 14px 28px -12px rgba(19,46,87,0.55)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <span style={{ fontFamily: OUTFIT, fontSize: 40, fontWeight: 700, color: '#fff' }}>{profile.displayName?.charAt(0)?.toUpperCase() ?? '?'}</span>}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} title="Change profile photo"
            style={{ position: 'absolute', right: 0, bottom: 2, width: 28, height: 28, borderRadius: '50%', border: '3px solid #fff', background: P.teal, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
            <Svg d={ICONS.camera} size={13} />
          </button>
        </div>

        <div style={{ minWidth: 0, flex: '1 1 260px', paddingBottom: 2 }}>
          <h1 style={{ margin: 0, fontFamily: OUTFIT, fontSize: 25, fontWeight: 700, color: P.navy, letterSpacing: '-0.02em', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.displayName}</h1>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <span style={{ padding: '3px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: withAlpha(P.teal, 0.12), color: '#0E6A79' }}>{roleLabel(profile)}</span>
            {roleType && roleType !== roleLabel(profile) && <span style={{ padding: '3px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: withAlpha('#F2AC18', 0.18), color: '#8A5A00' }}>{roleType}</span>}
            <span style={{ padding: '3px 11px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: profile.isActive ? '#E8F7EE' : '#FDECEC', color: profile.isActive ? '#15803D' : '#B91C1C', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{profile.isActive ? 'Active' : 'Inactive'}
            </span>
            {avatar && <button type="button" onClick={() => removeAvatar().catch(() => setToast({ message: 'Could not remove the photo.', type: 'error' }))} style={{ marginLeft: 4, padding: 0, border: 0, background: 'none', color: '#8A97AB', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>Remove photo</button>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 4, flexShrink: 0 }}>
          <Fact label="User ID" value={profile.userCode} />
          {shows('department') && <Fact label={labelOf('department', 'Department')} value={val('department') || <Empty text="Not set" />} />}
          <Fact label="Joined" value={profile.dateOfJoining ? fmtDay(profile.dateOfJoining.slice(0, 10)) : <Empty text="Not set" />} />
          {profile.dateOfJoining && <Fact label="With us" value={<span style={{ color: P.teal }}>{tenure(profile.dateOfJoining)}</span>} />}
        </div>
      </div>
    </section>
  )

  // ── Cards ──────────────────────────────────────────────────────────────────
  const personalRows = [
    ...CONTACT_KEYS.filter(shows).map(k => ({ key: k, label: labelOf(k, k), value: k === 'date_of_birth' && val(k) ? fmtDay(val(k).slice(0, 10)) : val(k), wide: k === 'email' || k === 'experience' })),
    ...moreFields.map(f => ({ key: f.fieldKey, label: f.label, value: f.fieldType === 'date' && val(f.fieldKey) ? fmtDay(val(f.fieldKey).slice(0, 10)) : val(f.fieldKey), wide: f.fieldType === 'textarea' })),
  ]
  const fullName = [val('first_name'), val('mid_name'), val('last_name')].filter(Boolean).join(' ') || profile.displayName
  const personalCard = (
    <Card title="Personal Information" icon={ICONS.person}>
      {/* Laid out like a national ID card: soft tinted card, fine pattern, name on top, number at the foot */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', padding: '11px 16px 12px 20px',
        background: `repeating-radial-gradient(circle at 88% 18%, ${withAlpha(P.teal, 0.055)} 0 1px, transparent 1px 9px), linear-gradient(135deg, #EDF7F4 0%, #F8FCFB 55%, #E4F2EE 100%)`,
        border: `1px solid ${withAlpha(P.teal, 0.22)}`, boxShadow: '0 16px 28px -24px rgba(19,46,87,0.6)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: `linear-gradient(180deg, ${P.teal}, ${P.navy})` }} />
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B8A86', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Name</div>
        <div style={{ fontFamily: OUTFIT, fontSize: 19, fontWeight: 700, color: P.navy, letterSpacing: '-0.01em', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</div>
        {shows('father_name') && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B8A86', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{labelOf('father_name', 'Father Name')}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: P.navy, marginTop: 1 }}>{val('father_name') || <Empty />}</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 16px', marginTop: 8 }}>
          {personalRows.map(r => (
            <div key={r.key} style={{ gridColumn: r.wide ? '1 / -1' : undefined, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B8A86', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{r.label}</div>
              <div style={{ marginTop: 1, fontSize: 14, fontWeight: 600, color: P.navy, wordBreak: 'break-word' }}>{r.value || <Empty />}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )

  const salaryCard = salary.length > 0 && (
    <Card title="Monthly Salary" icon={ICONS.cash}>
      {salaryTotal === 0 ? (
        <div style={{ margin: 'auto', textAlign: 'center', color: '#8A97AB', fontSize: 13 }}>Salary details are not set yet.<br />HR adds them.</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '14px 28px' }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8A97AB', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total per month</div>
            <div style={{ marginTop: 4, fontFamily: OUTFIT, fontSize: 30, fontWeight: 700, color: P.navy, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: GOLD, marginRight: 6 }}>PKR</span>{salaryTotal.toLocaleString('en-PK')}
            </div>
          </div>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div className="mv-grow" style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', marginBottom: 12, background: '#EEF2F6' }}>
              {salary.filter(s => s.value > 0).map(s => <div key={s.key} title={`${s.label}: ${pkr(s.value)}`} style={{ width: `${(s.value / salaryTotal) * 100}%`, background: s.color }} />)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${compact ? 2 : salary.length}, minmax(0, 1fr))`, gap: '10px 14px' }}>
              {salary.map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: '#8A97AB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: s.value ? P.navy : '#A3ADBB' }}>{s.value ? pkr(s.value) : 'None'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )

  const identityCard = (
    <Card title="Identity & Address" icon={ICONS.id}>
      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {IDENTITY_KEYS.filter(shows).map(k => (
          <InfoRow key={k} icon={EXTRA_ICONS[k]} label={labelOf(k, k)}>
            {val(k) ? (k === 'cnic' ? <span style={{ fontFamily: OUTFIT, letterSpacing: '0.06em' }}>{val(k)}</span> : val(k)) : <Empty />}
          </InfoRow>
        ))}
      </div>
    </Card>
  )

  const acct = val('bank_account_no').replace(/\s/g, '')
  const bankCard = BANK_KEYS.some(shows) && (
    <Card title="Bank Details" icon={ICONS.bank}>
      <div style={{ position: 'relative', borderRadius: 16, padding: '16px 18px', color: '#fff', overflow: 'hidden', minHeight: 136, display: 'flex', flexDirection: 'column',
        background: `radial-gradient(260px 140px at 100% 0%, ${withAlpha('#F2AC18', 0.35)}, transparent 70%), linear-gradient(135deg, ${P.navy} 0%, #1B4F7E 55%, ${P.teal} 100%)`, boxShadow: '0 18px 30px -20px rgba(19,46,87,0.9)' }}>
        <div style={{ position: 'absolute', right: -40, bottom: -60, width: 180, height: 180, borderRadius: '50%', border: '24px solid rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: OUTFIT, fontSize: 15, fontWeight: 600, letterSpacing: '0.02em' }}>{val('bank') || 'Bank not added'}</span>
          {/* card chip */}
          <span style={{ width: 34, height: 26, borderRadius: 6, background: 'linear-gradient(135deg, #F7D58B, #C8902A)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
        </div>
        <div style={{ marginTop: 'auto', fontFamily: OUTFIT, fontSize: 18, fontWeight: 500, letterSpacing: '0.14em' }}>
          {acct ? `•••• •••• ${acct.slice(-4)}` : '•••• •••• ••••'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{labelOf('account_title', 'Account Title')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val('account_title') || 'Not added'}</div>
          </div>
        </div>
      </div>
      {shows('iban_no') && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: '#F3F6F9' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#8A97AB', letterSpacing: '0.06em' }}>IBAN</span>
          <span style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 500, color: P.navy, letterSpacing: '0.05em', wordBreak: 'break-all' }}>
            {val('iban_no') ? val('iban_no').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim() : <Empty />}
          </span>
        </div>
      )}
    </Card>
  )

  const securityCard = (
    <Card title="Security" icon={ICONS.lock} action={
      <button type="submit" form="mv-password" disabled={pwLoading} style={{ ...btnPrimary, padding: '6px 14px', fontSize: 12.5, borderRadius: 10, opacity: pwLoading ? 0.65 : 1 }}>
        <Svg d={ICONS.lock} size={13} /> {pwLoading ? 'Updating...' : 'Update Password'}
      </button>
    }>
      <form id="mv-password" onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Field label="Current">
            <input type="password" value={pw.currentPassword} onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))} placeholder="Current" required className={inputCls} />
          </Field>
          <Field label="New">
            <input type="password" value={pw.newPassword} onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))} placeholder="Min 8 chars" minLength={8} required className={inputCls} />
          </Field>
          <Field label="Confirm">
            <input type="password" value={pw.newPasswordConfirmation} onChange={e => setPw(p => ({ ...p, newPasswordConfirmation: e.target.value }))} placeholder="Repeat it" required className={inputCls} />
          </Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            {[1, 2, 3, 4].map(i => <span key={i} style={{ flex: 1, height: 5, borderRadius: 99, background: pwScore >= i ? ['#EF4444', '#F59E0B', '#22C55E', P.teal][pwScore - 1] : '#E5EAF0', transition: 'background .2s' }} />)}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8A97AB', width: 60, textAlign: 'right', whiteSpace: 'nowrap' }}>{pwScore ? ['', 'Weak', 'Fair', 'Good', 'Strong'][pwScore] : 'Strength'}</span>
        </div>
        {pwError && <p style={{ margin: 0, fontSize: 12, color: '#EF4444' }}>{pwError}</p>}
      </form>
    </Card>
  )

  // ── Edit panel ─────────────────────────────────────────────────────────────
  const editPanel = editing && (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={() => { setEditing(false); load(profile) }} style={{ position: 'absolute', inset: 0, background: 'rgba(19,46,87,0.35)', backdropFilter: 'blur(2px)' }} />
      <aside style={{ position: 'relative', width: 'min(560px, 100%)', height: '100%', background: '#fff', boxShadow: '-20px 0 40px -20px rgba(19,46,87,0.5)', display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${withAlpha(P.navy, 0.08)}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(P.teal, 0.1), color: P.teal }}>
            <Svg d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" size={16} />
          </span>
          <div>
            <h2 style={{ margin: 0, fontFamily: OUTFIT, fontSize: 18, fontWeight: 700, color: P.navy }}>Edit Profile</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#8A97AB' }}>Joining date, department and salary are managed by HR.</p>
          </div>
          <button type="button" onClick={() => { setEditing(false); load(profile) }} title="Close" style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 10, border: 0, background: '#F3F6F9', color: P.slate, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Display Name" required error={err('display_name')}>
            <input value={form.display_name ?? ''} onChange={e => onField('display_name', e.target.value)} className={inputCls} />
          </Field>
          {sections.map(s => {
            const list = s.list.filter(f => !READONLY_KEYS.has(f.fieldKey))
            if (!list.length) return null
            return (
              <div key={s.name}>
                <div style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: P.teal, marginBottom: 8 }}>{s.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '10px 12px' }}>
                  {list.map(f => <EditField key={f.fieldKey} field={f} value={fieldValue(f.fieldKey)} onChange={onField} error={err(f.fieldKey)} />)}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${withAlpha(P.navy, 0.08)}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={() => { setEditing(false); load(profile); setErrors({}) }}
            style={{ padding: '9px 18px', borderRadius: 12, border: `1px solid ${withAlpha(P.navy, 0.15)}`, background: '#fff', color: P.navy, fontFamily: OUTFIT, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={save} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.65 : 1 }}>{loading ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </aside>
    </div>
  )

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {editPanel}
      <style>{`
        @keyframes mvGrow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .mv-grow { transform-origin: left; animation: mvGrow .9s cubic-bezier(.2,.8,.2,1) both }
        @media (prefers-reduced-motion: reduce) { .mv-grow { animation: none } }
      `}</style>
      <div style={{ height: compact ? 'auto' : '100vh', display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 18px 7px', overflowY: 'auto', fontFamily: FONT, background: P.bgMain }}>
        {header}
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))', alignContent: 'start' }}>
          <div style={{ display: 'flex', minWidth: 0 }}>{personalCard}</div>
          <div style={{ display: 'flex', minWidth: 0 }}>{identityCard}</div>
          {bankCard && <div style={{ display: 'flex', minWidth: 0 }}>{bankCard}</div>}
          {salaryCard && <div style={{ display: 'flex', minWidth: 0, gridColumn: compact ? undefined : 'span 2' }}>{salaryCard}</div>}
          <div style={{ display: 'flex', minWidth: 0 }}>{securityCard}</div>
        </div>
      </div>
    </>
  )
}
