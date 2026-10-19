'use client'

// My Profile, in the New Sale look: a summary bar (photo, name, role, contact) over gold-headed
// cards that fill one screen. The cards come from CRM Management > User Form; read-only values
// (joining date, department, salary) are set by HR. The photo is shared with the sidebar.

import { useState, useEffect, useMemo, useRef } from 'react'
import { STANDARD_FIELD_KEYS, snakeToCamel } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAuth } from '@/contexts/AuthContext'
import { useCompact } from '@/hooks/useMediaQuery'
import { apiGet, apiPut, errMsg, errFields } from '@/lib/api'
import { useAvatar, saveAvatar, removeAvatar } from '@/lib/avatar'
import { fmtDay } from '@/lib/format'
import { roleLabel } from '@/lib/roles'
import { P } from '@/lib/palette'
import { BEBAS, CRISP, ETHNO, RAJDHANI, FONT, inputCls, withAlpha, ICONS, Svg, Field, SectionCard, SummaryItem, NotSet, Info } from '@/components/sales/saleUi'
import type { FormField, User } from '@/types'

const CORE_KEYS     = new Set(['display_name', ...STANDARD_FIELD_KEYS.user])
const READONLY_KEYS = new Set(['date_of_joining', 'department', 'basic_salary', 'punctuality_allowance', 'travelling_allowance', 'other_allowance'])
const SALARY_KEYS   = ['basic_salary', 'punctuality_allowance', 'travelling_allowance', 'other_allowance']
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const SHADE = P.teal

function formatCNIC(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (d.length <= 5) return d
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}
const pkr = (v: number) => `PKR ${v.toLocaleString('en-PK')}`
const sectionIcon = (name: string) =>
  /salary/i.test(name) ? ICONS.cash : /bank/i.test(name) ? ICONS.bank : /cnic|address/i.test(name) ? ICONS.id : /personal/i.test(name) ? ICONS.person : ICONS.notes
const valueOf = (u: User, key: string) => {
  const v = (u as unknown as Record<string, unknown>)[snakeToCamel(key)]
  return v === null || v === undefined ? '' : String(v).slice(0, key.startsWith('date_') ? 10 : undefined)
}

/** One form field in edit mode; Textarea fields fill the rest of their card. */
function EditField({ field, value, onChange, error, fill }: { field: FormField; value: string; onChange: (k: string, v: string) => void; error?: string; fill?: boolean }) {
  const cls = `${inputCls} ${error ? 'border-red-400' : ''}`
  const handle = (e: React.ChangeEvent<any>) => onChange(field.fieldKey, e.target.value)
  let input: React.ReactNode
  switch (field.fieldType) {
    case 'date':     input = <DateInput value={value} onChange={handle} className={cls} />; break
    case 'number':   input = <input type="number" value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={cls} />; break
    case 'textarea': input = <textarea value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={`${cls} resize-none`} style={fill ? { flex: 1, minHeight: 56 } : undefined} rows={fill ? undefined : 2} />; break
    case 'select':
      input = <StyledSelect value={value} onChange={v => onChange(field.fieldKey, v)} placeholder="Select" borderColor={error ? '#f87171' : undefined} options={(field.options ?? []).map(o => ({ value: o, label: o }))} />
      break
    default:
      input = field.fieldKey === 'cnic'
        ? <input type="text" value={value} onChange={e => onChange(field.fieldKey, formatCNIC(e.target.value))} placeholder={field.placeholder ?? '00000-0000000-0'} maxLength={15} className={cls} />
        : <input type={field.fieldKey === 'email' ? 'email' : 'text'} value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={cls} />
  }
  return (
    <div style={{ gridColumn: `span ${COL_SPAN[field.colSpan] ?? 2}`, minWidth: 0, ...(fill ? { display: 'flex', flexDirection: 'column', minHeight: 0 } : {}) }}>
      <Field label={field.label} required={field.isRequired} error={error} fill={fill}>{input}</Field>
    </div>
  )
}

export default function ProfilePage() {
  const { user: me, updateUser } = useAuth()
  const compact = useCompact()
  const avatar  = useAvatar(me?.id)
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
    if (!file || !me) return
    saveAvatar(me.id, file)
      .then(() => setToast({ message: 'Profile photo updated.', type: 'success' }))
      .catch(err => setToast({ message: err?.message || 'Could not use that image.', type: 'error' }))
  }

  if (!profile) {
    return (
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1', height: 82, borderRadius: 14, background: '#fff', border: `1px solid ${P.border}` }} className="animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} style={{ height: 260, borderRadius: 12, background: '#fff', border: `1px solid ${P.border}` }} className="animate-pulse" />)}
      </div>
    )
  }

  const locked   = profile.profileLocked
  const roleType = profile.agentType ?? profile.managerType ?? null
  const err      = (k: string) => errors[snakeToCamel(k)]?.[0]
  const salary   = SALARY_KEYS.map(k => ({ key: k, value: parseFloat(valueOf(profile, k)) || 0 }))
  const salaryTotal = salary.reduce((s, x) => s + x.value, 0)

  const btn = (bg: string, color = '#fff', border?: string): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 8, border: border ? `1px solid ${border}` : 0, background: bg, color, cursor: 'pointer', whiteSpace: 'nowrap',
    fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  })
  const TEAL_BTN = `linear-gradient(135deg, ${P.teal} 0%, #0E5F6E 100%)`

  // ── Summary bar: photo, name and the account at a glance ───────────────────
  const summary = (
    <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: compact ? 'wrap' : 'nowrap', background: '#fff', borderRadius: 14, overflow: 'hidden', flexShrink: 0, border: `1px solid ${P.border}`, boxShadow: '0 8px 22px -18px rgba(19,46,87,0.6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 70px 10px 16px', minWidth: 300, flexShrink: 0, color: '#fff',
        background: `linear-gradient(90deg, ${SHADE} 0%, ${SHADE} 42%, ${withAlpha(SHADE, 0.88)} 54%, ${withAlpha(SHADE, 0.62)} 66%, ${withAlpha(SHADE, 0.36)} 77%, ${withAlpha(SHADE, 0.16)} 87%, ${withAlpha(SHADE, 0.05)} 94%, ${withAlpha(SHADE, 0)} 100%)` }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileRef.current?.click()} title="Change profile photo"
          style={{ position: 'relative', width: 58, height: 58, borderRadius: '50%', padding: 0, border: '2.5px solid rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.18)', cursor: 'pointer', flexShrink: 0, boxShadow: '0 6px 14px -6px rgba(0,0,0,0.35)' }}>
          {avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatar} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
            : <span style={{ fontFamily: BEBAS, ...CRISP, fontSize: 26, color: '#fff' }}>{profile.displayName?.charAt(0) ?? '?'}</span>}
          <span style={{ position: 'absolute', right: -3, bottom: -3, width: 22, height: 22, borderRadius: '50%', background: '#fff', color: SHADE, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
            <Svg d={ICONS.camera} size={12} />
          </span>
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: ETHNO, fontWeight: 300, fontSize: 10, letterSpacing: '0.05em', opacity: 0.9 }}>MY PROFILE</p>
          {editing && !locked ? (
            <input value={form.display_name ?? ''} onChange={e => onField('display_name', e.target.value)} placeholder="Display name"
              style={{ margin: '3px 0 1px', width: 200, padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.18)', color: '#fff', fontFamily: BEBAS, ...CRISP, fontSize: 20, letterSpacing: '0.05em', outline: 'none' }} />
          ) : (
            <p style={{ margin: '3px 0 0', fontFamily: BEBAS, ...CRISP, fontSize: 22, letterSpacing: '0.05em', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 230 }}>{profile.displayName}</p>
          )}
          <p style={{ margin: '1px 0 0', fontSize: 12, opacity: 0.88 }}>
            {roleLabel(profile)}
            {avatar && <button type="button" onClick={() => me && removeAvatar(me.id)} style={{ marginLeft: 8, padding: 0, border: 0, background: 'none', color: '#fff', opacity: 0.8, fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}>remove photo</button>}
          </p>
        </div>
      </div>
      <SummaryItem icon={ICONS.id} color={SHADE} label="User ID" compact>{profile.userCode}</SummaryItem>
      {roleType && <SummaryItem icon={ICONS.tag} color={SHADE} label="Role Type" compact>{roleType}</SummaryItem>}
      <SummaryItem icon={ICONS.mail} color={SHADE} label="Email" compact>{profile.email || <NotSet />}</SummaryItem>
      <SummaryItem icon={ICONS.calendar} color={SHADE} label="Joined" compact>{profile.dateOfJoining ? fmtDay(profile.dateOfJoining.slice(0, 10)) : <NotSet />}</SummaryItem>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', marginLeft: 'auto', flexShrink: 0 }}>
        {locked ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309', fontFamily: RAJDHANI, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <Svg d={ICONS.lock} size={13} /> Profile locked
          </span>
        ) : editing ? (
          <>
            <button type="button" onClick={() => { setEditing(false); load(profile); setErrors({}) }} style={btn('#fff', P.navy, P.border)}>Cancel</button>
            <button type="button" onClick={save} disabled={loading} style={{ ...btn(TEAL_BTN), opacity: loading ? 0.65 : 1 }}>{loading ? 'Saving...' : 'Save Changes'}</button>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)} style={btn(TEAL_BTN)}>Edit Profile</button>
        )}
      </div>
    </div>
  )

  // ── Cards ──────────────────────────────────────────────────────────────────
  const card = (name: string, list: FormField[]) => {
    const isSalary   = /salary/i.test(name)
    const isPersonal = /personal/i.test(name)
    let body: React.ReactNode
    if (isSalary) {
      body = salaryTotal === 0 ? (
        <p style={{ margin: 'auto', fontSize: 12.5, color: P.textMuted, textAlign: 'center' }}>Salary details not set yet. HR adds them.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 14px' }}>
            {list.map(f => {
              const v = parseFloat(valueOf(profile, f.fieldKey)) || 0
              return <Info key={f.fieldKey} label={f.label}>{v > 0 ? <span style={{ color: '#AA7F56' }}>{pkr(v)}</span> : null}</Info>
            })}
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: withAlpha('#AA7F56', 0.08), border: `1px solid ${withAlpha('#AA7F56', 0.25)}` }}>
            <span style={{ fontFamily: RAJDHANI, fontSize: 13, fontWeight: 700, color: '#5C6D82', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
            <span style={{ fontFamily: BEBAS, ...CRISP, fontSize: 20, letterSpacing: '0.04em', color: '#AA7F56' }}>{pkr(salaryTotal)}</span>
          </div>
        </div>
      )
    } else {
      const fillKeys = new Set(list.filter(f => f.fieldType === 'textarea').map(f => f.fieldKey))
      body = (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '10px 12px', flex: 1, alignContent: 'start',
          gridTemplateRows: fillKeys.size && editing ? `repeat(${Math.max(0, list.length - fillKeys.size)}, auto) repeat(${fillKeys.size}, 1fr)` : undefined }}>
          {list.map(f => {
            const ro = READONLY_KEYS.has(f.fieldKey) || locked
            if (editing && !ro) {
              return <EditField key={f.fieldKey} field={f} value={fieldValue(f.fieldKey)} onChange={onField} error={err(f.fieldKey)} fill={fillKeys.has(f.fieldKey)} />
            }
            const raw = CORE_KEYS.has(f.fieldKey) ? valueOf(profile, f.fieldKey) : (extra[f.fieldKey] ?? '')
            const shown = raw && f.fieldType === 'date' ? fmtDay(raw.slice(0, 10)) : raw
            return <Info key={f.fieldKey} label={f.label} span={COL_SPAN[f.colSpan] ?? 2}>{shown || null}</Info>
          })}
        </div>
      )
    }
    return (
      <SectionCard key={name} title={name} icon={sectionIcon(name)} done={0} total={0} complete={false}
        style={{ gridColumn: isPersonal && !compact ? 'span 2' : undefined }}>
        {body}
      </SectionCard>
    )
  }

  const passwordCard = (
    <SectionCard key="password" title="Change Password" icon={ICONS.lock} done={0} total={0} complete={false}>
      <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <Field label="Current Password">
          <input type="password" value={pw.currentPassword} onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))} placeholder="Current password" required className={inputCls} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Field label="New Password">
            <input type="password" value={pw.newPassword} onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))} placeholder="Min 8 characters" minLength={8} required className={inputCls} />
          </Field>
          <Field label="Confirm">
            <input type="password" value={pw.newPasswordConfirmation} onChange={e => setPw(p => ({ ...p, newPasswordConfirmation: e.target.value }))} placeholder="Repeat it" required className={inputCls} />
          </Field>
        </div>
        {pwError && <p style={{ margin: 0, fontSize: 12, color: '#EF4444' }}>{pwError}</p>}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-start' }}>
          <button type="submit" disabled={pwLoading} style={{ ...btn(TEAL_BTN), opacity: pwLoading ? 0.65 : 1 }}>{pwLoading ? 'Updating...' : 'Change Password'}</button>
        </div>
      </form>
    </SectionCard>
  )

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div style={{ height: compact ? 'auto' : '100vh', display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px 16px', overflowY: 'auto', fontFamily: FONT, background: P.bgMain }}>
        {summary}
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gap: 12, gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))', gridAutoRows: 'minmax(min-content, 1fr)' }}>
          {sections.map(s => card(s.name, s.list))}
          {passwordCard}
        </div>
      </div>
    </>
  )
}
