'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Role, AGENT_TYPES, MANAGER_TYPES, DEPARTMENTS, STANDARD_FIELD_KEYS, snakeToCamel } from '@crm/shared'
import Toast from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import StyledSelect from '@/components/ui/StyledSelect'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet, apiPost, apiPut, apiDelete, errMsg, errFields, downloadText } from '@/lib/api'
import { fmtDay, pktToday } from '@/lib/format'
import type { FormField, Page, User } from '@/types'

const HIERARCHY: Role[] = [Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT]
const VISIBLE_ROLES: Partial<Record<Role, Role[]>> = {
  [Role.ADMIN]:    [Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT],
  [Role.DIRECTOR]: [Role.DIRECTOR, Role.MANAGER, Role.AGENT],
  [Role.MANAGER]:  [Role.MANAGER, Role.AGENT],
}
const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  ADMIN: { bg: '#EDE9FE', color: '#6D28D9' }, DIRECTOR: { bg: '#DBEAFE', color: '#1D4ED8' },
  MANAGER: { bg: '#E0E7FF', color: '#4338CA' }, AGENT: { bg: '#CFFAFE', color: '#0E7490' },
}
const ALL_COLUMNS = [
  { key: 'userId', label: 'User ID' }, { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' },
  { key: 'roleType', label: 'Role Type' }, { key: 'department', label: 'Department' }, { key: 'contact', label: 'Contact' },
  { key: 'joined', label: 'Joined' }, { key: 'salary', label: 'Basic Salary' }, { key: 'status', label: 'Status' },
]
const ALL_COL_KEYS = ALL_COLUMNS.map(c => c.key)
const LS_COLS = 'mv_users_cols_v3', LS_ROLE = 'mv_users_role', LS_STATUS = 'mv_users_status'
const DEFAULT_PASSWORD = '12345678'
const CORE_KEYS = new Set(STANDARD_FIELD_KEYS.user)
const SALARY_KEYS = ['basic_salary', 'punctuality_allowance', 'travelling_allowance', 'other_allowance']
const COL_SPAN: Record<string, number> = { full: 6, two_thirds: 4, half: 3, third: 2 }
const inputCls  = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400'
const roleName = (r: string) => r.charAt(0) + r.slice(1).toLowerCase()

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ } }

function formatCNIC(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (d.length <= 5) return d
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}
const fmtPKR = (v?: string | null) => (!v || Number(v) === 0 ? 'N/A' : `PKR ${Number(v).toLocaleString('en-PK')}`)

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function DynamicField({ field, value, onChange, error }: { field: FormField; value: string; onChange: (k: string, v: string) => void; error?: string }) {
  const err = error ? 'border-red-400' : ''
  const handle = (e: React.ChangeEvent<any>) => onChange(field.fieldKey, e.target.value)
  let input: React.ReactNode
  if (field.fieldKey === 'cnic') {
    input = (
      <>
        <input type="text" value={value} onChange={e => onChange(field.fieldKey, formatCNIC(e.target.value))} placeholder={field.placeholder ?? '00000-0000000-0'} maxLength={15} className={`${inputCls} ${err}`} />
        <p className="mt-1 text-xs text-gray-400">Format: XXXXX-XXXXXXX-X</p>
      </>
    )
  } else if (field.fieldType === 'select') {
    const opts = field.options ?? (field.fieldKey === 'department' ? DEPARTMENTS : [])
    input = (
      <StyledSelect value={value} onChange={v => onChange(field.fieldKey, v)} placeholder={`Select ${field.label}`}
        borderColor={error ? '#f87171' : undefined} options={opts.map(o => ({ value: o, label: o }))} />
    )
  } else if (field.fieldType === 'date') {
    input = <DateInput value={value} onChange={handle} className={`${inputCls} ${err}`} />
  } else if (field.fieldType === 'textarea') {
    input = <textarea value={value} onChange={handle} rows={field.textareaRows || 2} placeholder={field.placeholder ?? ''} className={`${inputCls} resize-none ${err}`} />
  } else if (field.fieldType === 'amount_pkr' || field.fieldType === 'amount_usd') {
    input = (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold select-none">{field.fieldType === 'amount_pkr' ? '₨' : '$'}</span>
        <input type="number" min={0} step="0.01" value={value} onChange={handle} placeholder={field.placeholder ?? '0.00'} className={`${inputCls} pl-7 ${err}`} />
      </div>
    )
  } else if (field.fieldType === 'number') {
    input = <input type="number" value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={`${inputCls} ${err}`} />
  } else {
    const t = field.fieldKey === 'email' ? 'email' : field.fieldKey === 'phone' ? 'tel' : 'text'
    input = <input type={t} value={value} onChange={handle} placeholder={field.placeholder ?? ''} className={`${inputCls} ${err}`} />
  }
  return (
    <div style={{ gridColumn: `span ${COL_SPAN[field.colSpan] ?? 2}` }}>
      <Field label={field.label} required={field.isRequired} error={error}>{input}</Field>
    </div>
  )
}

type Form = Record<string, string>

function toForm(u?: User): { form: Form; extra: Form } {
  const form: Form = { userCode: '', password: u ? '' : DEFAULT_PASSWORD, role: '', displayName: '', agentType: '', managerType: '' }
  const extra: Form = {}
  if (!u) return { form, extra }
  form.userCode = u.userCode; form.role = u.role; form.displayName = u.displayName
  form.agentType = u.agentType ?? ''; form.managerType = u.managerType ?? ''
  for (const key of STANDARD_FIELD_KEYS.user) {
    const v = (u as unknown as Record<string, unknown>)[snakeToCamel(key)]
    form[key] = v === null || v === undefined ? '' : String(v).slice(0, key.startsWith('date_') ? 10 : undefined)
  }
  for (const [k, v] of Object.entries(u.extraFields ?? {})) extra[k] = v === null ? '' : String(v)
  return { form, extra }
}

function UserForm({ initial, allowedRoles, onSubmit, loading, errors }: {
  initial?: User; allowedRoles: Role[]; onSubmit: (payload: Record<string, unknown>) => void; loading: boolean; errors: Record<string, string[]>
}) {
  const isEdit = !!initial
  const init = useMemo(() => toForm(initial), [initial])
  const [form, setForm]   = useState<Form>({ ...init.form, role: init.form.role || allowedRoles[0] || '' })
  const [extra, setExtra] = useState<Form>(init.extra)
  const [fields, setFields] = useState<FormField[]>([])
  const [codeLoading, setCodeLoading] = useState(false)

  useEffect(() => { apiGet<FormField[]>('/crm/form-fields/public', { formType: 'user' }).then(setFields).catch(() => {}) }, [])

  const fetchNextCode = useCallback(async (role: string) => {
    if (isEdit || role === Role.ADMIN) return
    setCodeLoading(true)
    try {
      const { code } = await apiGet<{ code: string }>('/users/next-code', { role })
      setForm(p => ({ ...p, userCode: code, password: DEFAULT_PASSWORD }))
    } catch { /* ignore */ } finally { setCodeLoading(false) }
  }, [isEdit])

  useEffect(() => { if (!isEdit && allowedRoles[0]) fetchNextCode(allowedRoles[0]) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { order, grouped } = useMemo(() => {
    const order: string[] = [], grouped: Record<string, FormField[]> = {}
    fields.forEach(f => {
      const s = CORE_KEYS.has(f.fieldKey) ? (f.section || 'General') : 'Additional Fields'
      if (!grouped[s]) { grouped[s] = []; order.push(s) }
      grouped[s].push(f)
    })
    const i = order.indexOf('Additional Fields')
    if (i >= 0) order.push(order.splice(i, 1)[0])
    return { order, grouped }
  }, [fields])

  const err = (k: string) => errors[k]?.[0]
  const setAccount = (name: string, value: string) => {
    if (name === 'role') {
      fetchNextCode(value)
      setForm(p => ({ ...p, role: value, agentType: '', managerType: '' }))
    } else setForm(p => ({ ...p, [name]: value }))
  }
  const handleField = (key: string, val: string) => (CORE_KEYS.has(key) ? setForm(p => ({ ...p, [key]: val })) : setExtra(p => ({ ...p, [key]: val })))
  const total = SALARY_KEYS.reduce((s, k) => s + (parseFloat(form[k]) || 0), 0)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      userCode: form.userCode || null, role: form.role, displayName: form.displayName,
      agentType: form.role === Role.AGENT ? form.agentType || null : null,
      managerType: form.role === Role.MANAGER ? form.managerType || null : null,
    }
    if (form.password) payload.password = form.password
    for (const key of STANDARD_FIELD_KEYS.user) {
      if (!(key in form)) continue
      const v = form[key] === '' ? null : form[key]
      if (isEdit && key === 'date_of_joining' && v === null) continue
      payload[snakeToCamel(key)] = v
    }
    const extras = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== ''))
    payload.extraFields = extras
    onSubmit(payload)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Account</p>
      <div className={`grid gap-4 ${form.role === Role.AGENT || form.role === Role.MANAGER ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Field label="Role" required error={err('role')}>
          <StyledSelect value={form.role} onChange={v => setAccount('role', v)} disabled={isEdit} required
            options={(isEdit && !allowedRoles.includes(form.role as Role) ? [form.role as Role, ...allowedRoles] : allowedRoles).map(r => ({ value: r, label: roleName(r) }))} />
        </Field>
        {form.role === Role.AGENT && (
          <Field label="Agent Type">
            <StyledSelect value={form.agentType} onChange={v => setAccount('agentType', v)} placeholder="Select Type"
              options={[{ value: '', label: 'Select Type' }, ...AGENT_TYPES.map(t => ({ value: t, label: t }))]} />
          </Field>
        )}
        {form.role === Role.MANAGER && (
          <Field label="Manager Type">
            <StyledSelect value={form.managerType} onChange={v => setAccount('managerType', v)} placeholder="Select Type"
              options={[{ value: '', label: 'Select Type' }, ...MANAGER_TYPES.map(t => ({ value: t, label: t }))]} />
          </Field>
        )}
        <Field label="Display Name" required error={err('displayName')}>
          <input value={form.displayName} onChange={e => setAccount('displayName', e.target.value)} placeholder="e.g. John Smith" required className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Username" required>
          <input value={form.userCode} disabled placeholder={codeLoading ? 'Generating' : ''} className={inputCls} />
        </Field>
        <Field label="Password" required={!isEdit}>
          <input type="text" value={form.password} onChange={e => setAccount('password', e.target.value)} required={!isEdit} minLength={8}
            placeholder={isEdit ? 'Leave blank to keep the current password' : DEFAULT_PASSWORD} className={inputCls} />
        </Field>
      </div>

      {order.map(section => {
        const list = grouped[section] ?? []
        const salary = SALARY_KEYS.some(k => list.some(f => f.fieldKey === k))
        return (
          <div key={section}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest pt-2 pb-1">{section}</p>
            <div className={salary ? 'rounded-xl border border-gray-200 bg-gray-50 p-4' : ''}>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                {list.map(f => (
                  <DynamicField key={f.fieldKey} field={f} value={(CORE_KEYS.has(f.fieldKey) ? form[f.fieldKey] : extra[f.fieldKey]) ?? ''} onChange={handleField} error={err(f.fieldKey)} />
                ))}
              </div>
              {salary && total > 0 && (
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-200">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Package</span>
                  <span className="text-sm font-bold" style={{ color: '#AA7F56' }}>PKR {total.toLocaleString('en-PK')}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}

      <div className="flex justify-end gap-3 pt-2">
        <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)', color: '#ffffff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
          {loading ? 'Saving' : isEdit ? 'Save Changes' : 'Create User'}
        </button>
      </div>
    </form>
  )
}

function ColumnPicker({ visible, onChange }: { visible: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const all = visible.length === ALL_COLUMNS.length
  const toggle = (key: string) => {
    if (visible.includes(key) && visible.length === 1) return
    onChange(visible.includes(key) ? visible.filter(k => k !== key) : [...visible, key])
  }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
        style={{ background: open ? 'linear-gradient(135deg,#132E57,#1E8496)' : 'rgba(255,255,255,0.15)', color: '#FFFFFF', border: '1px solid', borderColor: open ? '#D7A520' : 'rgba(255,255,255,0.3)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
        Columns {visible.length < ALL_COLUMNS.length && <span className="ml-0.5 opacity-70">({visible.length}/{ALL_COLUMNS.length})</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 rounded-xl shadow-xl border overflow-hidden w-52" style={{ background: '#0D1B2A', borderColor: '#3F4753' }}>
          <label className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer border-b" style={{ borderColor: '#3F4753', background: 'rgba(170,127,86,0.08)' }}>
            <input type="checkbox" checked={all} onChange={() => onChange(all ? [ALL_COL_KEYS[0]] : ALL_COL_KEYS)} className="w-3.5 h-3.5 accent-amber-500 cursor-pointer" />
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#FBDCB4' }}>{all ? 'Deselect All' : 'Select All'}</span>
          </label>
          {ALL_COLUMNS.map(col => (
            <label key={col.key} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors hover:bg-white/5">
              <input type="checkbox" checked={visible.includes(col.key)} onChange={() => toggle(col.key)} className="w-3.5 h-3.5 accent-amber-500 cursor-pointer" />
              <span className="text-xs" style={{ color: visible.includes(col.key) ? '#FBDCB4' : '#9FA7B2' }}>{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function Confirm({ children, onCancel, onConfirm, confirmLabel, confirmCls }: { children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmCls: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="mb-5">{children}</div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${confirmCls}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const pos = HIERARCHY.indexOf(me?.role as Role)
  const allowedRoles = pos >= 0 ? HIERARCHY.slice(pos + 1) : []
  const canManage = (u: User) => allowedRoles.includes(u.role)

  const [data, setData]       = useState<Page<User> | null>(null)
  const [page, setPage]       = useState(1)
  const [roleFilter, setRoleFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser]     = useState<User | null>(null)
  const [disableUser, setDisableUser] = useState<User | null>(null)
  const [disableDate, setDisableDate] = useState('')
  const [confirm, setConfirm] = useState<{ type: 'lock' | 'activate'; user: User } | null>(null)
  const [busy, setBusy]       = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({})
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [visibleCols, setVisibleCols] = useState<string[]>(ALL_COL_KEYS)

  useEffect(() => {
    setVisibleCols(lsGet(LS_COLS, ALL_COL_KEYS))
    setRoleFilter(lsGet(LS_ROLE, ''))
    setStatusFilter(lsGet(LS_STATUS, 'active'))
  }, [])
  useEffect(() => { lsSet(LS_COLS, visibleCols) }, [visibleCols])
  useEffect(() => { lsSet(LS_ROLE, roleFilter) }, [roleFilter])
  useEffect(() => { lsSet(LS_STATUS, statusFilter) }, [statusFilter])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      setData(await apiGet<Page<User>>('/users', { page, status: statusFilter, role: roleFilter, search }))
    } catch {
      setToast({ message: 'Failed to load users.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, roleFilter, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleExport = async () => {
    try {
      const { csv, filename } = await apiGet<{ csv: string; filename: string }>('/users', { format: 'csv', status: statusFilter, role: roleFilter, search })
      downloadText(csv, filename)
    } catch {
      setToast({ message: 'Export failed.', type: 'error' })
    }
  }

  const save = async (payload: Record<string, unknown>) => {
    setBusy(true); setFormErrors({})
    try {
      if (editUser) await apiPut(`/users/${editUser.id}`, payload)
      else await apiPost('/users', payload)
      setToast({ message: editUser ? 'User updated successfully.' : 'User created successfully.', type: 'success' })
      setEditUser(null); setShowCreate(false)
      fetchUsers()
    } catch (e) {
      setFormErrors(errFields(e))
      setToast({ message: errMsg(e, editUser ? 'Failed to update user.' : 'Failed to create user.'), type: 'error' })
    } finally { setBusy(false) }
  }

  const handleDisable = async () => {
    if (!disableUser || !disableDate) return
    setBusy(true)
    try {
      await apiDelete(`/users/${disableUser.id}`, { inactiveSince: disableDate })
      setToast({ message: `${disableUser.displayName} disabled.`, type: 'success' })
      setDisableUser(null); setDisableDate('')
      fetchUsers()
    } catch (e) {
      setToast({ message: errMsg(e, 'Failed to disable user.'), type: 'error' })
    } finally { setBusy(false) }
  }

  const handleConfirm = async () => {
    if (!confirm) return
    const { type, user: u } = confirm
    setConfirm(null)
    try {
      if (type === 'activate') {
        await apiPost(`/users/${u.id}/activate`)
        setToast({ message: `${u.displayName} re-activated.`, type: 'success' })
      } else {
        const { profileLocked } = await apiPost<{ profileLocked: boolean }>(`/users/${u.id}/toggle-lock`)
        setToast({ message: `${u.displayName} ${profileLocked ? 'locked' : 'unlocked'}.`, type: 'success' })
      }
      fetchUsers()
    } catch (e) {
      setToast({ message: errMsg(e, 'Action failed.'), type: 'error' })
    }
  }

  const users = data?.data ?? []
  const from = data ? (data.currentPage - 1) * data.perPage + 1 : 0
  const col = (k: string) => visibleCols.includes(k)
  const th = (right = false): React.CSSProperties => ({ color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.07em', textAlign: right ? 'right' : 'left' })

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {showCreate && (
        <Modal title="Create New User" onClose={() => { setShowCreate(false); setFormErrors({}) }}>
          <UserForm allowedRoles={allowedRoles} onSubmit={save} loading={busy} errors={formErrors} />
        </Modal>
      )}
      {editUser && (
        <Modal title={`Edit ${editUser.displayName}`} onClose={() => { setEditUser(null); setFormErrors({}) }}>
          <UserForm initial={editUser} allowedRoles={allowedRoles} onSubmit={save} loading={busy} errors={formErrors} />
        </Modal>
      )}

      {disableUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDisableUser(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-sm font-semibold text-gray-800">Disable &quot;{disableUser.displayName}&quot;</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-5">This user will no longer be able to log in.</p>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Inactive From <span className="text-red-500">*</span></label>
            <DateInput value={disableDate} onChange={e => setDisableDate(e.target.value)} max={pktToday()} className={inputCls} />
            <p className="mt-1.5 mb-5 text-xs text-gray-400">The date from which the employee is considered inactive (for example their last working day).</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDisableUser(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleDisable} disabled={busy || !disableDate} className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 bg-red-600 hover:bg-red-700">{busy ? 'Disabling' : 'Disable User'}</button>
            </div>
          </div>
        </div>
      )}

      {confirm?.type === 'lock' && (
        <Confirm onCancel={() => setConfirm(null)} onConfirm={handleConfirm} confirmLabel="Confirm" confirmCls="bg-blue-600 hover:bg-blue-700">
          <p className="text-sm text-gray-700">{confirm.user.profileLocked ? 'Unlock' : 'Lock'} profile of &quot;{confirm.user.displayName}&quot;?</p>
        </Confirm>
      )}
      {confirm?.type === 'activate' && (
        <Confirm onCancel={() => setConfirm(null)} onConfirm={handleConfirm} confirmLabel="Re-activate" confirmCls="bg-green-600 hover:bg-green-700">
          <p className="text-sm font-semibold text-gray-800">Re-activate &quot;{confirm.user.displayName}&quot;?</p>
          <p className="text-xs text-gray-500 mt-0.5">They will regain access to the system.</p>
        </Confirm>
      )}

      <div className="p-5 space-y-4" style={{ background: '#EDF0F3', minHeight: '100vh' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ color: '#132E57', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>My Team</h1>
            <p className="text-sm mt-0.5" style={{ color: '#5C5C5C' }}>{me?.role === Role.MANAGER ? 'Manage your agents' : 'Create and manage system users'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:bg-[#AA7F56]/25"
              style={{ background: 'rgba(170,127,86,0.12)', color: '#AA7F56', border: '1px solid rgba(170,127,86,0.3)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
              Export
            </button>
            {allowedRoles.length > 0 && (
              <button onClick={() => { setShowCreate(true); setFormErrors({}) }} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all"
                style={{ background: 'linear-gradient(135deg, #1E8496 0%, #0E5F6E 100%)', color: '#ffffff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.04em' }}>
                + New User
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5 shadow-sm" style={{ background: 'linear-gradient(135deg, #0E5F6E 0%, #1E8496 100%)', border: '1px solid #1A7888' }}>
          {me?.role !== Role.MANAGER && (
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.15)' }}>
              {[{ label: 'All Roles', value: '' }, ...(VISIBLE_ROLES[me?.role as Role] ?? []).map(r => ({ label: roleName(r), value: r }))].map(({ label, value }) => (
                <button key={value} onClick={() => { setRoleFilter(value); setPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={roleFilter === value
                    ? { background: 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)', color: '#fff', fontFamily: "'Rajdhani', sans-serif", boxShadow: '0 2px 8px rgba(19,46,87,0.4)' }
                    : { background: 'transparent', color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif" }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.15)' }}>
            {[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'All', value: 'all' }].map(({ label, value }) => (
              <button key={value} onClick={() => { setStatusFilter(value); setPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={statusFilter === value
                  ? { background: value === 'inactive' ? 'linear-gradient(135deg, #C25A1F 0%, #E07840 100%)' : 'linear-gradient(135deg, #132E57 0%, #1E8496 100%)', color: '#fff', fontFamily: "'Rajdhani', sans-serif" }
                  : { background: 'transparent', color: '#FFFFFF', fontFamily: "'Rajdhani', sans-serif" }}>
                {label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="px-3 py-1.5 rounded-lg text-xs outline-none transition w-44 placeholder-white/70"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }} />
          <ColumnPicker visible={visibleCols} onChange={setVisibleCols} />
          {data && <span className="ml-auto text-xs font-bold text-white">{data.total} user{data.total !== 1 ? 's' : ''}</span>}
        </div>

        <div className="rounded-xl overflow-hidden shadow-sm" style={{ border: '1px solid #E0DDD5', background: '#FFFFFF' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'linear-gradient(90deg, #4A5568 0%, #5A6880 100%)' }}>
                  {ALL_COLUMNS.filter(c => col(c.key)).map(c => <th key={c.key} className="px-4 py-2.5 text-xs font-bold uppercase" style={th()}>{c.label}</th>)}
                  <th className="px-4 py-2.5 text-xs font-bold uppercase" style={th(true)}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: visibleCols.length + 1 }).map((__, j) => <td key={j} className="px-4 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-24" /></td>)}</tr>
                )) : users.length === 0 ? (
                  <tr><td colSpan={visibleCols.length + 1} className="px-5 py-10 text-center text-gray-400 text-sm">No users found.</td></tr>
                ) : users.map(u => {
                  const badge = ROLE_BADGE[u.role] ?? { bg: '#F3F4F6', color: '#6B7280' }
                  const inactive = !u.isActive
                  return (
                    <tr key={u.id} className="bg-white transition-colors hover:bg-gray-50" style={{ borderBottom: '1px solid #F3F4F6', ...(inactive ? { opacity: 0.65 } : {}) }}>
                      {col('userId') && <td className="px-4 py-2"><span className="font-mono text-xs font-semibold text-gray-500">{u.userCode}</span></td>}
                      {col('name') && (
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: inactive ? '#9CA3AF' : '#3F4753' }}>{(u.displayName || u.userCode)[0].toUpperCase()}</div>
                            <span className="font-medium text-gray-800 text-sm">{u.displayName}</span>
                          </div>
                        </td>
                      )}
                      {col('role') && <td className="px-4 py-2"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: badge.bg, color: badge.color }}>{roleName(u.role)}</span></td>}
                      {col('roleType') && (
                        <td className="px-4 py-2">
                          {u.agentType || u.managerType
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={u.agentType ? { background: '#FEF3C7', color: '#92400E' } : { background: '#EDE9FE', color: '#5B21B6' }}>{u.agentType ?? u.managerType}</span>
                            : <span className="text-xs text-gray-400">N/A</span>}
                        </td>
                      )}
                      {col('department') && <td className="px-4 py-2 text-xs text-gray-500">{u.department ?? 'N/A'}</td>}
                      {col('contact') && <td className="px-4 py-2 text-xs text-gray-500">{u.email ?? u.phone ?? 'N/A'}</td>}
                      {col('joined') && <td className="px-4 py-2 text-xs text-gray-500">{fmtDay(u.dateOfJoining?.slice(0, 10) ?? u.createdAt)}</td>}
                      {col('salary') && <td className="px-4 py-2 text-xs font-medium" style={{ color: u.basicSalary ? '#AA7F56' : '#9CA3AF' }}>{fmtPKR(u.basicSalary)}</td>}
                      {col('status') && (
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-0.5">
                            {inactive ? (
                              <>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 w-fit">Inactive</span>
                                {u.inactiveSince && <span className="text-xs text-gray-400">since {fmtDay(u.inactiveSince.slice(0, 10))}</span>}
                              </>
                            ) : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 w-fit">Active</span>}
                            {u.profileLocked && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 w-fit">Locked</span>}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManage(u) && !inactive && (
                            <button onClick={() => { setEditUser(u); setFormErrors({}) }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                            </button>
                          )}
                          {me?.role === Role.ADMIN && canManage(u) && !inactive && (
                            <button onClick={() => setConfirm({ type: 'lock', user: u })} title={u.profileLocked ? 'Unlock profile' : 'Lock profile'}
                              className={`p-1.5 rounded-lg transition-colors ${u.profileLocked ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                            </button>
                          )}
                          {canManage(u) && !inactive && (
                            <button onClick={() => { setDisableUser(u); setDisableDate('') }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Disable user">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>
                            </button>
                          )}
                          {canManage(u) && inactive && (
                            <button onClick={() => setConfirm({ type: 'activate', user: u })} className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="Re-activate user">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {data && data.lastPage > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">Showing {from} to {from + users.length - 1} of {data.total} users</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={data.currentPage === 1} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">Previous</button>
                <span className="text-xs text-gray-500">{data.currentPage} / {data.lastPage}</span>
                <button onClick={() => setPage(p => Math.min(data.lastPage, p + 1))} disabled={data.currentPage === data.lastPage} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
