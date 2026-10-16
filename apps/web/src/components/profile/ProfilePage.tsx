'use client'

import { useState, useEffect, useMemo } from 'react'
import { STANDARD_FIELD_KEYS, snakeToCamel } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet, apiPut, errMsg, errFields } from '@/lib/api'
import { roleLabel } from '@/lib/roles'
import type { FormField, User } from '@/types'

const CORE_KEYS = new Set(['display_name', ...STANDARD_FIELD_KEYS.user])
const READONLY_KEYS = new Set(['date_of_joining', 'department', 'basic_salary', 'punctuality_allowance', 'travelling_allowance', 'other_allowance'])
const SALARY_KEYS = ['basic_salary', 'punctuality_allowance', 'travelling_allowance', 'other_allowance']
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const inputCls    = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed'
const inputErrCls = 'border-red-400 focus:border-red-400 focus:ring-red-400/20'

function formatCNIC(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (d.length <= 5) return d
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}
const fmtPKR = (v: unknown) => (!v || Number(v) === 0 ? null : `PKR ${Number(v).toLocaleString('en-PK')}`)

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50"><h3 className="text-sm font-semibold text-gray-700">{title}</h3></div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function DynamicField({ field, value, onChange, disabled, error }: { field: FormField; value: string; onChange: (k: string, v: string) => void; disabled: boolean; error?: string }) {
  const cls = `${inputCls} ${error ? inputErrCls : ''}`
  const handle = (e: React.ChangeEvent<any>) => onChange(field.fieldKey, e.target.value)
  let input: React.ReactNode
  switch (field.fieldType) {
    case 'date':     input = <DateInput value={value} onChange={handle} disabled={disabled} className={cls} />; break
    case 'number':   input = <input type="number" value={value} onChange={handle} disabled={disabled} placeholder={field.placeholder ?? ''} className={cls} />; break
    case 'textarea': input = <textarea value={value} onChange={handle} disabled={disabled} placeholder={field.placeholder ?? ''} rows={field.textareaRows || 3} className={`${cls} resize-none`} />; break
    case 'select':
      input = (
        <StyledSelect value={value} onChange={v => onChange(field.fieldKey, v)} disabled={disabled} placeholder="Select"
          borderColor={error ? '#f87171' : undefined} options={(field.options ?? []).map(o => ({ value: o, label: o }))} />
      )
      break
    case 'amount_usd':
    case 'amount_pkr':
      input = (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold select-none">{field.fieldType === 'amount_usd' ? '$' : '₨'}</span>
          <input type="number" value={value} onChange={handle} disabled={disabled} placeholder={field.placeholder ?? '0.00'} className={`${cls} pl-7`} />
        </div>
      )
      break
    default:
      input = field.fieldKey === 'cnic'
        ? <input type="text" value={value} onChange={e => onChange(field.fieldKey, formatCNIC(e.target.value))} disabled={disabled} placeholder={field.placeholder ?? '00000-0000000-0'} maxLength={15} className={cls} />
        : <input type={field.fieldKey === 'email' ? 'email' : 'text'} value={value} onChange={handle} disabled={disabled} placeholder={field.placeholder ?? ''} className={cls} />
  }
  return <div style={{ gridColumn: `span ${COL_SPAN[field.colSpan] ?? 2}` }}><Field label={field.label} required={field.isRequired && !disabled} error={error}>{input}</Field></div>
}

const valueOf = (u: User, key: string) => {
  const v = (u as unknown as Record<string, unknown>)[snakeToCamel(key)]
  return v === null || v === undefined ? '' : String(v).slice(0, key.startsWith('date_') ? 10 : undefined)
}

export default function ProfilePage() {
  const { updateUser } = useAuth()
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

  const { order, grouped } = useMemo(() => {
    const order: string[] = [], grouped: Record<string, FormField[]> = {}
    fields.forEach(f => {
      const s = f.section || 'General'
      if (!grouped[s]) { grouped[s] = []; order.push(s) }
      grouped[s].push(f)
    })
    return { order, grouped }
  }, [fields])

  const onField = (key: string, val: string) => {
    if (CORE_KEYS.has(key)) setForm(p => ({ ...p, [key]: val }))
    else setExtra(p => ({ ...p, [key]: val }))
  }

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

  if (!profile) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3 mb-4" />
            <div className="space-y-3">{[1, 2].map(j => <div key={j} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          </div>
        ))}
      </div>
    )
  }

  const locked = profile.profileLocked
  const disabled = !editing || locked
  const roleType = profile.agentType ?? profile.managerType ?? null
  const salaryTotal = SALARY_KEYS.reduce((s, k) => s + (parseFloat(valueOf(profile, k)) || 0), 0)
  const err = (k: string) => errors[k]?.[0]

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ color: '#132E57', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>My Profile</h1>
            <p className="text-sm text-gray-500 mt-0.5">View and manage your account details</p>
          </div>
          {locked ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">Profile Locked</div>
          ) : editing ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setEditing(false); load(profile); setErrors({}) }} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ border: '1px solid #5C6D82', color: '#5C6D82', background: 'transparent' }}>Cancel</button>
              <button type="button" onClick={save} disabled={loading} className="px-5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)', color: '#ffffff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
                {loading ? 'Saving' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="px-5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all"
              style={{ background: 'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)', color: '#ffffff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>Edit Profile</button>
          )}
        </div>

        <SectionCard title="Account">
          <div className={`grid gap-4 ${roleType ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>
            <Field label="Username"><input value={profile.userCode} disabled readOnly className={inputCls} /></Field>
            <Field label="Role"><input value={roleLabel(profile)} disabled readOnly className={inputCls} /></Field>
            {roleType && <Field label="Role Type"><input value={roleType} disabled readOnly className={inputCls} /></Field>}
            <Field label="Display Name">
              <input value={form.display_name ?? ''} onChange={e => onField('display_name', e.target.value)} disabled={disabled} className={inputCls} />
            </Field>
          </div>
        </SectionCard>

        {order.map(section => {
          const list = grouped[section] ?? []
          if (section === 'Salary (PKR)') {
            return (
              <SectionCard key={section} title={section}>
                {salaryTotal === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">Salary details not set. Contact HR.</p>
                ) : (
                  <div className="flex items-center divide-x divide-gray-200 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                    {list.map(f => (
                      <div key={f.fieldKey} className="flex-1 px-4 py-3 text-center">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                        <p className="text-sm font-bold" style={{ color: Number(valueOf(profile, f.fieldKey)) > 0 ? '#AA7F56' : '#9CA3AF' }}>{fmtPKR(valueOf(profile, f.fieldKey)) ?? 'N/A'}</p>
                      </div>
                    ))}
                    <div className="flex-1 px-4 py-3 text-center" style={{ background: 'rgba(170,127,86,0.06)' }}>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Total</p>
                      <p className="text-sm font-bold" style={{ color: '#AA7F56' }}>PKR {salaryTotal.toLocaleString('en-PK')}</p>
                    </div>
                  </div>
                )}
              </SectionCard>
            )
          }
          return (
            <SectionCard key={section} title={section}>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                {list.map(f => (
                  <DynamicField key={f.fieldKey} field={f} value={(CORE_KEYS.has(f.fieldKey) ? form[f.fieldKey] : extra[f.fieldKey]) ?? ''}
                    onChange={onField} disabled={disabled || READONLY_KEYS.has(f.fieldKey)} error={err(snakeToCamel(f.fieldKey))} />
                ))}
              </div>
            </SectionCard>
          )
        })}

        <SectionCard title="Change Password">
          <form onSubmit={changePassword} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Current Password">
                <input type="password" value={pw.currentPassword} onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))} placeholder="Current password" required className={inputCls} />
              </Field>
              <Field label="New Password">
                <input type="password" value={pw.newPassword} onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))} placeholder="Min 8 characters" minLength={8} required className={inputCls} />
              </Field>
              <Field label="Confirm New Password">
                <input type="password" value={pw.newPasswordConfirmation} onChange={e => setPw(p => ({ ...p, newPasswordConfirmation: e.target.value }))} placeholder="Repeat new password" required className={inputCls} />
              </Field>
            </div>
            {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={pwLoading} className="px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)', color: '#ffffff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
                {pwLoading ? 'Updating' : 'Change Password'}
              </button>
            </div>
          </form>
        </SectionCard>
      </div>
    </>
  )
}
