'use client'

// User Access Level: change a user's role.

import { useState, useEffect } from 'react'
import StyledSelect from '@/components/ui/StyledSelect'
import { apiGet, apiPut, errMsg } from '@/lib/api'
import type { User } from '@/types'
import DataTable from '@/components/ui/DataTable'
import { P } from '@/lib/palette'
import { TEAL, GRAD, SetToast } from './shared'
// ════════════════════════════════════════════════════════════════════════════
// User Access Level
// ════════════════════════════════════════════════════════════════════════════
const ROLE_OPTS = [
  { value: 'AGENT', label: 'Agent' }, { value: 'MANAGER', label: 'Manager' },
  { value: 'DIRECTOR', label: 'Director' }, { value: 'ADMIN', label: 'Admin' },
]
const STATUS_COLOR: Record<string, string> = { active: '#16a34a', inactive: '#dc2626', locked: '#d97706' }

export function UserAccessTab({ setToast }: { setToast: SetToast }) {
  const [users, setUsers]     = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Record<string, string>>({})
  const [saving, setSaving]   = useState<Record<string, boolean>>({})

  useEffect(() => {
    apiGet<User[]>('/users', { perPage: 'all' })
      .then(r => setUsers(Array.isArray(r) ? r : []))
      .catch(() => setToast({ type: 'error', message: 'Failed to load users.' }))
      .finally(() => setLoading(false))
  }, [setToast])

  const save = async (user: User) => {
    const role = pending[user.id]
    if (!role) return
    setSaving(s => ({ ...s, [user.id]: true }))
    try {
      const res = await apiPut<{ user: User }>(`/crm/users/${user.id}/role`, { role })
      setToast({ type: 'success', message: `Role updated for ${user.displayName ?? user.userCode}.` })
      setPending(p => { const n = { ...p }; delete n[user.id]; return n })
      setUsers(us => us.map(u => u.id === user.id ? { ...u, ...res.user } : u))
    } catch (err) {
      setToast({ type: 'error', message: errMsg(err, 'Failed to update role.') })
    } finally {
      setSaving(s => { const n = { ...s }; delete n[user.id]; return n })
    }
  }

  const statusOf = (u: User) => (!u.isActive ? 'inactive' : u.profileLocked ? 'locked' : 'active')
  const isDirty = (u: User) => pending[u.id] !== undefined && pending[u.id] !== u.role

  return (
    <DataTable<User>
      id="crm-user-access"
      rows={users}
      loading={loading}
      rowKey={u => u.id}
      emptyText="No users found."
      // The role dropdown opens below its cell, so the table must not clip it
      containerStyle={{ overflowX: 'visible' }}
      columns={[
        { key: 'name', label: 'Name', width: 200, headerStyle: { borderTopLeftRadius: 11 }, render: u => <span style={{ fontWeight: 600, color: P.textHeading }}>{u.displayName || 'N/A'}</span> },
        { key: 'code', label: 'Username', width: 120, render: u => <span style={{ fontSize: 12, fontWeight: 700, color: P.teal, letterSpacing: '0.04em' }}>{u.userCode}</span> },
        { key: 'role', label: 'Role', width: 170, cellStyle: { overflow: 'visible' }, render: u => (
          <StyledSelect value={pending[u.id] ?? u.role} onChange={v => setPending(p => ({ ...p, [u.id]: v }))} options={ROLE_OPTS} borderColor={isDirty(u) ? TEAL : undefined} compact />
        ) },
        { key: 'dept', label: 'Department', width: 170, render: u => <span style={{ fontSize: 12, color: P.slate }}>{u.department ?? u.managerType ?? 'N/A'}</span> },
        { key: 'status', label: 'Status', width: 110, render: u => {
          const s = statusOf(u)
          return <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: `${STATUS_COLOR[s]}18`, color: STATUS_COLOR[s] }}>{s}</span>
        } },
        { key: 'action', label: 'Action', width: 100, resizable: false, headerStyle: { borderTopRightRadius: 11 }, render: u => isDirty(u) && (
          <button onClick={() => save(u)} disabled={saving[u.id]}
            style={{ padding: '4px 12px', borderRadius: 8, border: 0, background: GRAD, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving[u.id] ? 0.6 : 1, fontFamily: "'Aptos', sans-serif" }}>
            {saving[u.id] ? 'Saving...' : 'Save'}
          </button>
        ) },
      ]}
    />
  )
}
