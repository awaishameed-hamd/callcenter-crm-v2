'use client'

import { useState, useEffect, useCallback } from 'react'
import { P } from '@/lib/palette'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import DataTable, { Column } from '@/components/ui/DataTable'
import StyledSelect from '@/components/ui/StyledSelect'

interface User {
  id:          string
  userCode:    string
  displayName: string
  email:       string
  role:        string
  managerType: string | null
  isActive:    boolean
  phone:       string | null
  createdAt:   string
}

const ROLE_OPTS = [
  { value: '',         label: 'All Roles' },
  { value: 'ADMIN',    label: 'Admin' },
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'MANAGER',  label: 'Manager' },
  { value: 'AGENT',    label: 'Agent' },
]

const MANAGER_TYPE_OPTS = [
  { value: '',          label: 'None' },
  { value: 'REGULAR',   label: 'Regular' },
  { value: 'HR',        label: 'HR' },
  { value: 'ACCOUNTANT',label: 'Accountant' },
]

export default function UsersPage() {
  const [users,   setUsers]   = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('')
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [form, setForm] = useState({ displayName: '', email: '', password: '', role: '', managerType: '', phone: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const showToast = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = roleFilter ? { role: roleFilter } : {}
      const { data } = await api.get('/users', { params })
      setUsers(data?.data ?? data ?? [])
    } catch { setUsers([]) } finally { setLoading(false) }
  }, [roleFilter])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm({ displayName: '', email: '', password: '', role: '', managerType: '', phone: '' })
    setErrors({})
    setModal(true)
  }

  const openEdit = (u: User) => {
    setEditing(u)
    setForm({ displayName: u.displayName, email: u.email, password: '', role: u.role, managerType: u.managerType ?? '', phone: u.phone ?? '' })
    setErrors({})
    setModal(true)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.displayName.trim()) e.displayName = 'Required'
    if (!form.email.trim())       e.email       = 'Required'
    if (!editing && !form.password.trim()) e.password = 'Required'
    if (!editing && form.password.length < 8) e.password = 'Min 8 characters'
    if (!form.role)                e.role        = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload: any = { displayName: form.displayName, email: form.email, role: form.role, phone: form.phone || undefined, managerType: form.managerType || undefined }
      if (!editing) payload.password = form.password
      else if (form.password) payload.password = form.password

      if (editing) await api.put(`/users/${editing.id}`, payload)
      else         await api.post('/users', payload)
      showToast(editing ? 'User updated.' : 'User created.', true)
      setModal(false)
      load()
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Save failed', false)
    } finally { setSaving(false) }
  }

  const handleToggle = async (u: User) => {
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive })
      showToast(u.isActive ? 'User deactivated.' : 'User activated.', true)
      load()
    } catch (e: any) { showToast(e?.response?.data?.message ?? 'Error', false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: `1.5px solid ${P.border}`, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', color: P.navy,
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: P.textLabel, marginBottom: 5 }
  const errStyle: React.CSSProperties   = { fontSize: 11, color: '#D62828', marginTop: 3 }

  const columns: Column<User>[] = [
    { key: 'userCode',    label: 'Code',       width: 100 },
    { key: 'displayName', label: 'Name',       width: 160 },
    { key: 'email',       label: 'Email',      width: 200 },
    { key: 'role',        label: 'Role',       width: 100, render: r => r.role.charAt(0) + r.role.slice(1).toLowerCase() },
    { key: 'managerType', label: 'Type',       width: 110, render: r => r.managerType ?? '' },
    { key: 'phone',       label: 'Phone',      width: 120, render: r => r.phone ?? '' },
    {
      key: 'isActive', label: 'Active', width: 80,
      render: r => (
        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: r.isActive ? '#D1FAE5' : '#FEE2E2', color: r.isActive ? '#065F46' : '#991B1B' }}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { key: 'createdAt', label: 'Joined', width: 100, render: r => formatDate(r.createdAt) },
    {
      key: 'actions', label: 'Actions', width: 150, resizable: false,
      render: r => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => openEdit(r)} style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${P.navy}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>Edit</button>
          <button onClick={() => handleToggle(r)}
            style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: r.isActive ? '#FEE2E2' : '#D1FAE5', color: r.isActive ? '#991B1B' : '#065F46', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            {r.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Inter', sans-serif" }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? '#065F46' : '#991B1B', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{toast.msg}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: P.navy, margin: 0 }}>Users</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 150 }}>
            <StyledSelect value={roleFilter} onChange={setRoleFilter} options={ROLE_OPTS} placeholder="Filter by role" />
          </div>
          <button onClick={openCreate}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
            + Add User
          </button>
        </div>
      </div>

      <DataTable id="users" columns={columns} rows={users} loading={loading} rowKey={r => r.id} minWidth={900} />

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 30px', width: 440, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 700, color: P.navy, margin: 0 }}>{editing ? 'Edit User' : 'Add User'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: P.textMuted }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Full Name *</label>
                <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  style={{ ...inputStyle, borderColor: errors.displayName ? '#D62828' : P.border }} />
                {errors.displayName && <div style={errStyle}>{errors.displayName}</div>}
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ ...inputStyle, borderColor: errors.email ? '#D62828' : P.border }} />
                {errors.email && <div style={errStyle}>{errors.email}</div>}
              </div>
              <div>
                <label style={labelStyle}>Password {editing ? '(leave blank to keep)' : '*'}</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={editing ? 'Leave blank to keep current' : 'Min 8 characters'}
                  style={{ ...inputStyle, borderColor: errors.password ? '#D62828' : P.border }} />
                {errors.password && <div style={errStyle}>{errors.password}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Role *</label>
                  <StyledSelect value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))}
                    options={[{ value: 'ADMIN', label: 'Admin' }, { value: 'DIRECTOR', label: 'Director' }, { value: 'MANAGER', label: 'Manager' }, { value: 'AGENT', label: 'Agent' }]}
                    placeholder="Select role" borderColor={errors.role ? '#D62828' : undefined} />
                  {errors.role && <div style={errStyle}>{errors.role}</div>}
                </div>
                {form.role === 'MANAGER' && (
                  <div>
                    <label style={labelStyle}>Manager Type</label>
                    <StyledSelect value={form.managerType} onChange={v => setForm(f => ({ ...f, managerType: v }))} options={MANAGER_TYPE_OPTS} placeholder="Select type" />
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${P.border}`, background: '#fff', color: P.navy, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: P.navy, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Inter',sans-serif", opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : (editing ? 'Update' : 'Create User')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
